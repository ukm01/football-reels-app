require('dotenv').config();
const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());

AWS.config.update({ region: process.env.AWS_REGION });
const dynamo = new AWS.DynamoDB.DocumentClient();

// Get all video metadata
app.get('/api/videos', async (req, res) => {
  try {
    const data = await dynamo.scan({ TableName: process.env.DYNAMO_TABLE }).promise();
    const sorted = (data.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch (err) {
    console.error("Error fetching videos:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Trigger the video generation script
app.get('/api/generate', async (req, res) => {
  const scriptPath = path.join(__dirname, 'scripts', 'generateContent.js');
  console.log("⚙️ Triggering video generation...");

  exec(`node ${scriptPath}`, async (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Error generating content: ${error.message}`);
      return res.status(500).json({ error: 'Video generation failed.' });
    }

    console.log("✅ Script output:\n", stdout);

    // Optionally return latest generated video from DynamoDB
    try {
      const result = await dynamo.scan({ TableName: process.env.DYNAMO_TABLE }).promise();
      const latest = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return res.json({ message: 'Video generated successfully', video: latest });
    } catch (dynamoErr) {
      return res.json({ message: 'Video generated, but failed to fetch metadata' });
    }
  });
});

app.listen(PORT, () => console.log(`🚀 Backend API server running on http://localhost:${PORT}`));
