const { spawn } = require('child_process');
const express = require('express');
const app = express();
const port = 3000; // Make sure this matches the port your server is listening on

// Add a new route to run the Python script
app.get('/run-python', (req, res) => {
  const pythonScript = './py-scripts/Static Malware Analyzer.py'; // Path to your Python script
  const filePath = './Evasive Panda'; // Path to the file you want to hash

  // Spawn the Python process
  const pythonProcess = spawn('.venv/bin/python3', [pythonScript, filePath]);

  let scriptOutput = '';
  let scriptError = '';

  pythonProcess.stdout.on('data', (data) => {
    scriptOutput += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    scriptError += data.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script exited with code ${code}`);
      console.error(`Script Error: ${scriptError}`);
      res.status(500).send(`Error executing Python script: ${scriptError}`);
    } else {
      console.log(`Python script output: ${scriptOutput}`);
      try {
        // Assuming the Python script prints a JSON string of the hashes
        const hashes = JSON.parse(scriptOutput);
        res.json(hashes);
      } catch (e) {
        console.error("Failed to parse Python script output as JSON:", e);
        res.status(500).send("Failed to parse Python script output.");
      }
    }
  });
});

// Add this at the end of your index.js file to start the server
app.listen(port, () => {
  console.log(`Node.js server listening at http://localhost:${port}`);
});

// Keep your existing routes above this new route and the app.listen call
