const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({path: 'config.env'});
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const port = 3000;

// Import models
const File = require('./models/File');
const AnalysisReport = require('./models/AnalysisReport');
const User = require('./models/User');

// Import middleware
const auth = require('./middleware/auth');

app.use(cors());
app.use(express.json()); // For parsing JSON bodies

// JWT Secret from environment
const JWT_SECRET = process.env.JWT_SECRET;

mongoose.connect(process.env.DB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

app.use('/plots', express.static('plots'));

// AI Model configuration
const AI_MODEL_URL = process.env.AI_MODEL_URL;
const AI_MODEL_HEADERS = {
  "Authorization": `Bearer ${process.env.AI_MODEL_TOKEN}`
};

// Authentication Routes
app.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, jobTitle, yearsOfExperience, password, company } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !jobTitle || !yearsOfExperience || !password || !company) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username: email }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const user = new User({
      name,
      email,
      phone,
      jobTitle,
      yearsOfExperience,
      company,
      username: email, // Using email as username
      password: hashedPassword
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });

    // Return user data (without password) and token
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      jobTitle: user.jobTitle,
      yearsOfExperience: user.yearsOfExperience,
      company: user.company,
      role: user.role,
      createdAt: user.createdAt
    };

    res.status(201).json({
      message: 'User created successfully',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });

    // Return user data (without password) and token
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      jobTitle: user.jobTitle,
      yearsOfExperience: user.yearsOfExperience,
      company: user.company,
      role: user.role,
      createdAt: user.createdAt
    };

    res.json({
      message: 'Login successful',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Protected route to get user profile
app.get('/profile', auth, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to send file to AI model
async function sendToAIModel(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const base64Content = fileContent.toString('base64');
    
    const payload = {
      file_bytes: base64Content
    };

    const response = await axios.post(AI_MODEL_URL, payload, {
      headers: AI_MODEL_HEADERS,
      timeout: 30000 // 30 seconds timeout
    });

    return response.data;
  } catch (error) {
    console.error('AI Model Error:', error.response?.data || error.message);
    throw new Error(`AI Model request failed: ${error.message}`);
  }
}

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
     // console.error('Python stderr:', data.toString());
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

// Helper function to check if file size is suitable for AI analysis
function isFileSizeSuitable(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const sizeInBytes = stats.size;
    const minSize = 1024; // 1KB
    const maxSize = 25 * 1024 * 1024; // 25MB
    return sizeInBytes >= minSize && sizeInBytes <= maxSize;
  } catch (error) {
    console.error('Error checking file size:', error);
    return false;
  }
}

app.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.log('No file uploaded');
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const password = req.body.password || '';
  const userId = req.user._id; // Get authenticated user's ID

  try {
    // Always call the analyzer with file, original name, and optional password
    const args = [filePath, originalName];
    if (password) args.push(password);
    // If archive, add --keep-extracted flag
    const isArchive = /\.(zip|rar|7z)$/i.test(originalName);
    if (isArchive) args.push('--keep-extracted');
    const analysisResult = await runPythonScript('./py-scripts/Static Malware Analyzer.py', args);

    // For each sample, run get-hashes, check DB, and build response
    const results = [];
    const filesToCleanup = [];
    for (const sample of analysisResult.results) {
      // The analyzer returns: { filename, file_path, analysis, plots }
      const sampleFile = sample.filename;
      const samplePath = sample.file_path;
      if (samplePath && samplePath !== filePath) filesToCleanup.push(samplePath);
      let hashResult = null;
      let dbStatus = null;
      let dbReport = null;
      let aiResult = null;
      
      // Check if analysis returned an error (e.g., file size unsuitable)
      if (sample.analysis && sample.analysis.error) {
        results.push({
          filename: sampleFile,
          analysis: sample.analysis,
          plots: sample.plots,
          hash: null,
          dbStatus: 'analysis_error',
          dbReport: null,
          aiResult: null,
          error: sample.analysis.error
        });
        continue; // Skip AI processing for this sample
      }
      
      if (samplePath) {
        try {
          hashResult = await runPythonScript('./py-scripts/get-hashes.py', [samplePath]);
          if (hashResult && hashResult.md5) {
            const fileDoc = await File.findOne({ hash: hashResult.md5 });
            if (fileDoc) {
              dbStatus = 'found';
              dbReport = await AnalysisReport.findOne({ fileId: fileDoc._id });
            } else {
              dbStatus = 'not_found';
              // Check file size before sending to AI model
              if (isFileSizeSuitable(samplePath)) {
                // Send to AI model and save results
                try {
                  aiResult = await sendToAIModel(samplePath);
                  console.log('AI Model Response:', aiResult);
                  if (!aiResult.predictions_file) {
                    throw new Error('AI model did not return predictions_file');
                  }
                  // Save file to database with authenticated user's ID
                  const newFileDoc = await File.create({
                    name: sampleFile,
                    hash: hashResult.md5,
                    status: 'analyzed',
                    uploadDate: new Date(),
                    userId: userId // Use authenticated user's ID
                  });

                  // Save AI analysis report to database
                  const newReportDoc = await AnalysisReport.create({
                    fileId: newFileDoc._id,
                    analysisDate: new Date(),
                    predictions_file: aiResult.predictions_file,
                    probability_file: aiResult.probability_file ?? null,
                    predictions_family: aiResult.predictions_family ?? [],
                    probability_family: aiResult.probability_family ?? []
                  });

                  dbReport = newReportDoc;
                  dbStatus = 'ai_analyzed';
                } catch (aiError) {
                  console.error('AI Model Error for sample:', sampleFile, aiError);
                  dbStatus = 'ai_failed';
                }
              } else {
                // File size not suitable for AI analysis
                dbStatus = 'size_unsuitable';
                console.log(`File ${sampleFile} skipped from AI analysis due to unsuitable size`);
              }
            }
          } else {
            dbStatus = 'hash_failed';
          }
        } catch (err) {
          dbStatus = 'hash_error';
        }
      } else {
        dbStatus = 'not_available';
      }
      results.push({
        filename: sampleFile,
        analysis: sample.analysis,
        plots: sample.plots,
        hash: hashResult,
        dbStatus,
        dbReport,
        aiResult
      });
    }
    res.json({ results });
    // Clean up uploaded file and extracted files
    fs.unlink(filePath, () => {});
    for (const f of filesToCleanup) fs.unlink(f, () => {});
  } catch (error) {
    console.error('Error processing file:', error);
    fs.unlink(filePath, () => {});
    res.status(500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Node.js server listening at http://localhost:${port}`);
});
