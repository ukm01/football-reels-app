require('dotenv').config();

const RunwayML = require('@runwayml/sdk');
const AWS = require('aws-sdk');
const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const crypto = require('crypto');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const runway = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });
AWS.config.update({ region: process.env.AWS_REGION });

const polly = new AWS.Polly();
const s3 = new AWS.S3();
const dynamo = new AWS.DynamoDB.DocumentClient();

const tmpDir = __dirname;
const timestamp = Date.now();
const videoFile = `${tmpDir}/${timestamp}_video.mp4`;
const audioFile = `${tmpDir}/${timestamp}_audio.mp3`;
const finalVideoFile = `${tmpDir}/${timestamp}_football_reel.mp4`;

const imagePrompt = "High quality sports photograph of a soccer player scoring a goal in a packed stadium, crowd cheering, dramatic lighting";
const videoPromptText = "Camera pans and slows down: a soccer player scores a goal in a packed stadium as fans cheer loudly.";

(async () => {
  try {
    console.log("🔄 Generating base image with DALL·E 3 via OpenAI...");
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: "A professional footballer celebrating a goal, cinematic lighting",
      n: 1,
      size: "1024x1024",
      response_format: "url"
    });

    const imageUrl = imageResponse.data[0].url // ✅ Fixed structure

    if (!imageUrl) throw new Error("DALL·E did not return an image URL.");
    console.log("🖼 Image URL:", imageUrl);
    console.log("✅ Image generated successfully.");

    console.log("🔄 Starting video generation using Runway Gen-3 Alpha Turbo...");
    const runwayTask = await runway.imageToVideo.create({
      model: 'gen3a_turbo',
      promptImage: imageUrl,
      promptText: videoPromptText,
      duration: 5
    });

    console.log(`✅ Runway task created with ID: ${runwayTask.id}`);
    console.log("🔄 Waiting for video generation to complete...");

    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 30;
    const pollIntervalMs = 5000;

    while (attempts < maxAttempts) {
      const taskStatus = await runway.tasks.retrieve(runwayTask.id);
      const status = taskStatus.status;
      if (status === "SUCCEEDED") {
        videoUrl = Array.isArray(taskStatus.output)
          ? taskStatus.output[0]
          : (taskStatus.output?.video || taskStatus.output);
        break;
      } else if (status === "FAILED" || status === "CANCELED") {
        throw new Error(`Video generation failed (status: ${status}).`);
      }
      attempts++;
      console.log(`... status: ${status} (attempt ${attempts})`);
      await new Promise(res => setTimeout(res, pollIntervalMs));
    }

    if (!videoUrl) throw new Error("Video generation did not complete in time.");
    console.log("✅ Video generation succeeded.");

    console.log("🔄 Downloading video...");
    const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(videoFile, videoResponse.data);
    console.log(`✅ Video downloaded to ${videoFile}`);

    console.log("🔄 Generating commentary with GPT-4...");
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: "You are an enthusiastic sports commentator, describing highlights with excitement and clarity." },
        { role: 'user', content: "We have a 10-second soccer highlight video showing a player scoring a spectacular goal and the crowd cheering. Provide an exciting, two-sentence commentary for this moment." }
      ]
    });

    const commentary = chatResponse.choices[0].message.content.trim();
    if (!commentary) throw new Error("Failed to generate commentary.");
    console.log("✅ Commentary generated:", commentary);

    console.log("🔄 Converting commentary to speech with Amazon Polly...");
    const speechResult = await polly.synthesizeSpeech({
      Text: commentary,
      VoiceId: 'Matthew',
      OutputFormat: 'mp3',
      Engine: 'standard'
    }).promise();

    if (!speechResult.AudioStream) throw new Error("Polly returned no audio.");
    fs.writeFileSync(audioFile, speechResult.AudioStream);
    console.log(`✅ Audio saved to ${audioFile}`);

    console.log("🔄 Merging video and audio with FFmpeg...");
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-i', videoFile,
        '-i', audioFile,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', 'faststart',
        '-y', finalVideoFile
      ]);

      ffmpeg.stderr.on('data', data => process.stdout.write(data.toString()));
      ffmpeg.on('error', reject);
      ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`)));
    });
    console.log(`✅ Merged video saved to ${finalVideoFile}`);

    console.log("🔄 Uploading to S3...");
    const s3Key = `videos/${timestamp}_football_reel.mp4`;
    const uploadResult = await s3.upload({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fs.createReadStream(finalVideoFile),
      ContentType: 'video/mp4'
    }).promise();

    const videoUrlPublic = uploadResult.Location;
    console.log(`✅ Uploaded to S3 at ${videoUrlPublic}`);

    console.log("🔄 Storing metadata in DynamoDB...");
    const metadata = {
      id: crypto.randomUUID(),
      title: "Football Highlight Reel",
      description: commentary,
      videoUrl: videoUrlPublic,
      createdAt: new Date().toISOString()
    };

    await dynamo.put({ TableName: process.env.DYNAMO_TABLE, Item: metadata }).promise();
    console.log(`✅ Metadata stored. ID: ${metadata.id}`);

    console.log("🎉 Generation complete!");

    try {
      fs.unlinkSync(videoFile);
      fs.unlinkSync(audioFile);
      fs.unlinkSync(finalVideoFile);
    } catch {}

  } catch (err) {
    console.error("❌ Error during content generation:", err);
    process.exit(1);
  }
})();
