import AWS from 'aws-sdk';

const dynamo = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const data = await dynamo.scan({ TableName: process.env.DYNAMO_TABLE }).promise();
    const sorted = (data.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.status(200).json(sorted);
  } catch (err) {
    console.error("Error fetching videos:", err);
    return res.status(500).json({ error: 'Server error' });
  }
}
