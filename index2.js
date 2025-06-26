const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({path: 'config.env'});
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const app = express();
const port = 3000;

// Import models
const File = require('./models/File');
const AnalysisReport = require('./models/AnalysisReport');

app.use(cors());
mongoose.connect(process.env.DB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

app.use('/plots', express.static('plots'));

// Helper function to run Python script and get output
const runPythonScript = (scriptPath, args, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('.venv/bin/python3', [scriptPath, ...args], { timeout });
    let scriptOutput = '';
    let scriptError = '';

    pythonProcess.stdout.on('data', (data) => {
      scriptOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      scriptError += data.toString();
      console.error('Python stderr:', data.toString());
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });

    pythonProcess.on('close', (code, signal) => {
      if (signal === 'SIGTERM') {
        reject(new Error('Python script timed out.'));
      } else if (code !== 0) {
        reject(new Error(`Python script exited with code ${code}: ${scriptError}`));
      } else {
        try {
          const result = JSON.parse(scriptOutput);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e.message}`));
        }
      }
    });
  });
};

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.log('No file uploaded');
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  // Determine userId: 0 for guest, or from request body for authenticated users
  let userId = 0;
  if (req.body.userId && req.body.userId !== '0') {
    userId = req.body.userId;
  }

  try {
    // Step 1: Run static malware analysis and respond immediately
    const analysisResult = await runPythonScript('./py-scripts/Static Malware Analyzer.py', [filePath, originalName]);
    const plotBaseUrl = `${req.protocol}://${req.get('host')}/plots/`;
    const plotFiles = [
      `${originalName}_overall_entropy.png`,
      `${originalName}_PE_section_entropy.png`,
      `${originalName}_ELF_section_entropy.png`
    ];
    const plotUrls = plotFiles
      .map(name => plotBaseUrl + name)
      .filter(url => fs.existsSync('plots/' + url.split('/plots/')[1]));

    // Respond to client with static analysis result immediately
    res.json({
      analysis: analysisResult,
      plots: plotUrls
    });

    // Step 2: In the background, run get-hashes and check DB
    (async () => {
      try {
        const hashesResult = await runPythonScript('./py-scripts/get-hashes.py', [filePath]);
        if (!hashesResult.md5) {
          throw new Error('Failed to get MD5 hash');
        }
        // Check if file with this hash exists
        let fileDoc = await File.findOne({ hash: hashesResult.md5 });
        if (!fileDoc) {
          // File not found, create new File document (with userId: 0 for guest)
          fileDoc = await File.create({
            name: originalName,
            hash: hashesResult.md5,
            status: 'pending',
            uploadDate: new Date(),
            userId: userId
          });
        }
        if (fileDoc) {
          // File exists, fetch analysis report
          const reportDoc = await AnalysisReport.findOne({ fileId: fileDoc._id });
          // TODO: Send this result to the client (WebSocket, notification, etc.)
          console.log('DB analysis found for hash:', hashesResult.md5, reportDoc);
        } else {
          // File not found, TODO: send to AI model, save result, and notify client
          console.log('Hash not found in DB, would send to AI model:', hashesResult.md5);
          // Example placeholder for future AI model integration:
          // const aiResult = await runAIModel(filePath);
          // Save file and report to DB
          // const newFile = await File.create({ ... });
          // const newReport = await AnalysisReport.create({ ... });
          // TODO: Notify client with new analysis
        }
      } catch (err) {
        console.error('Background hash/DB/AI check error:', err);
      } finally {
        fs.unlink(filePath, () => {});
      }
    })();

  } catch (error) {
    console.error('Error processing file:', error);
    fs.unlink(filePath, () => {});
    res.status(500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Node.js server listening at http://localhost:${port}`);
});
