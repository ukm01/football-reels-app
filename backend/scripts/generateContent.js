require('dotenv').config();  // Load environment variables from .env
// const path = require('path');

// Import required packages
// const { Configuration, OpenAIApi } = require('openai');
const RunwayML = require('@runwayml/sdk');
const AWS = require('aws-sdk');
const axios = require('axios');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const os = require('os');
const crypto = require('crypto');

// Initialize API clients with credentials from environment

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const runway = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });  // RunwayML API client
AWS.config.update({ region: process.env.AWS_REGION });                // Set AWS region
const polly = new AWS.Polly();
const s3 = new AWS.S3();
const dynamo = new AWS.DynamoDB.DocumentClient();

// Define output file paths in the system's temp directory
const tmpDir = __dirname;
const timestamp = Date.now();
const videoFile = `${tmpDir}/${timestamp}_video.mp4`;
const audioFile = `${tmpDir}/${timestamp}_audio.mp3`;
const finalVideoFile = `${tmpDir}/${timestamp}_football_reel.mp4`;  // merged output

// Define content prompts (you can adjust these for different themes)
const imagePrompt = "High quality sports photograph of a soccer player scoring a goal in a packed stadium, crowd cheering, dramatic lighting";
const videoPromptText = "Camera pans and slows down: a soccer player scores a goal in a packed stadium as fans cheer loudly.";

(async () => {
  try {
    console.log("🔄 Generating base image with DALL·E 3 via OpenAI...");
    // Use DALL·E 3 (OpenAI Image Generation API) to create an image for the video
    const imageResponse =  await openai.images.generate({
      model: "dall-e-3",
      prompt: "A professional footballer celebrating a goal, cinematic lighting",
      n: 1,
      size: "1024x1024",
      response_format: "url" // get image as base64 JSON
    });
    const imageUrl = imageResponse.data[0].url;
    console.log("🖼 Image URL:", imageUrl);
   
    console.log("✅ Image generated successfully.");

    // Convert base64 image to data URI for Runway input
    

    console.log("🔄 Starting video generation using Runway Gen-3 Alpha Turbo...");
    // Create an image-to-video generation task on RunwayML (Gen-3 Alpha Turbo model)
    const runwayTask = await runway.imageToVideo.create({
      model: 'gen3a_turbo',
      promptImage: imageUrl,
      promptText: videoPromptText,
      duration: 5,  // (optional) video duration in seconds, default is 10
      // ratio: '1280:720'  // (optional) 16:9 aspect ratio, default is 16:9
    });
    console.log(`✅ Runway task created with ID: ${runwayTask.id}`);

    console.log("🔄 Waiting for video generation to complete...");
    // Poll the Runway task until it succeeds or fails
    let videoUrl = null;
    let attempts = 0;
    const maxAttempts = 30;            // timeout after ~2.5 minutes (5s * 30)
    const pollIntervalMs = 5000;       // 5 seconds between polls
    while (attempts < maxAttempts) {
      const taskStatus = await runway.tasks.retrieve(runwayTask.id);
      const status = taskStatus.status;
      if (status === "SUCCEEDED") {
        videoUrl = Array.isArray(taskStatus.output) ? taskStatus.output[0] : (taskStatus.output?.video || taskStatus.output);
        console.log("✅ Video generation succeeded.");
        break;
      } else if (status === "FAILED" || status === "CANCELED") {
        throw new Error(`Video generation failed (status: ${status}).`);
      } else {
        attempts++;
        console.log(`... video generation status: ${status} (attempt ${attempts})`);
        await new Promise(res => setTimeout(res, pollIntervalMs));
      }
    }
    if (!videoUrl) {
      throw new Error("Video generation did not complete within the expected time.");
    }

    console.log("🔄 Downloading generated video...");
    // Download the video from the ephemeral URL provided by Runway
    const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(videoFile, videoResponse.data);
    console.log(`✅ Video downloaded to ${videoFile}`);

    console.log("🔄 Generating commentary with GPT-4...");
    // Use GPT-4 to create a commentary script for the video
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: "You are an enthusiastic sports commentator, describing highlights with excitement and clarity." },
        { role: 'user', content: "We have a 10-second soccer highlight video showing a player scoring a spectacular goal and the crowd cheering. Provide an exciting, two-sentence commentary for this moment." }
      ]
    });
    
    const commentary = chatResponse.choices[0].message.content.trim();
    if (!commentary) {
      throw new Error("Failed to generate commentary text.");
    }
    console.log("✅ Commentary generated:", commentary);

    console.log("🔄 Converting commentary to speech with Amazon Polly (voice: Matthew)...");
    // Use Amazon Polly to synthesize speech from the commentary text
    const speechParams = {
      Text: commentary,
      VoiceId: 'Matthew',
      OutputFormat: 'mp3',
      Engine: 'standard'  // use Neural engine for higher quality if available
    };
    const speechResult = await polly.synthesizeSpeech(speechParams).promise();
    if (!speechResult.AudioStream) {
      throw new Error("Polly synthesis failed: no audio stream returned.");
    }
    // Save the audio stream to a file
    fs.writeFileSync(audioFile, speechResult.AudioStream);
    console.log(`✅ Audio commentary saved to ${audioFile}`);

    console.log("🔄 Merging video and audio with FFmpeg...");
    // Merge the video and audio into one final video file
    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(ffmpegPath, [
        '-i', videoFile,
        '-i', audioFile,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', 'faststart',
        '-y', finalVideoFile
      ]);
    
      ffmpegProcess.stderr.on('data', data => {
        process.stdout.write(data.toString()); // Show FFmpeg output
      });
    
      ffmpegProcess.on('error', reject);
      ffmpegProcess.on('close', code => {
        if (code === 0) {
          console.log(`✅ Merged video saved to ${finalVideoFile}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });
    console.log(`✅ Merged video saved to ${finalVideoFile}`);

    console.log("🔄 Uploading final video to S3 bucket...");
    // Define S3 upload parameters
    const s3Key = `videos/${timestamp}_football_reel.mp4`;
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fs.createReadStream(finalVideoFile),
      ContentType: 'video/mp4'
    };
    const uploadResult = await s3.upload(uploadParams).promise();
    const videoUrlPublic = uploadResult.Location;
    console.log(`✅ Video uploaded to S3 at ${videoUrlPublic}`);

    console.log("🔄 Storing video metadata to DynamoDB...");
    // Prepare metadata item
    const videoId = crypto.randomUUID();  // unique ID for the video record
    const title = "Football Highlight Reel";
    const description = commentary;       // use the commentary text as the description
    const createdAt = new Date().toISOString();
    const item = { id: videoId, title, description, videoUrl: videoUrlPublic, createdAt };
    // Save metadata to DynamoDB
    await dynamo.put({ TableName: process.env.DYNAMO_TABLE, Item: item }).promise();
    console.log(`✅ Metadata stored in DynamoDB (Table: ${process.env.DYNAMO_TABLE}, ID: ${videoId})`);

    console.log("🎉 Content generation pipeline completed successfully.");
    
    // (Optional) Clean up temporary files
    try { fs.unlinkSync(videoFile); fs.unlinkSync(audioFile); fs.unlinkSync(finalVideoFile); } catch {}
  } catch (err) {
    console.error("❌ Error during content generation:", err);
    process.exit(1);
  }
})();
