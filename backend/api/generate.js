import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import AWS from 'aws-sdk';

const execAsync = promisify(exec);
const dynamo = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const scriptPath = path.join(process.cwd(), 'scripts', 'generateContent.js');

  try {
    const { stdout } = await execAsync(`node "${scriptPath}"`);
    console.log(stdout);

    const result = await dynamo.scan({ TableName: process.env.DYNAMO_TABLE }).promise();
    const latest = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return res.status(200).json({ message: 'Video generated successfully', video: latest });
  } catch (error) {
    console.error('❌ Generation error:', error.message);
    return res.status(500).json({ error: 'Video generation failed.' });
  }
}
