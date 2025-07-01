const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  password: { type: String, required: false },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: false },
  jobTitle: { type: String, required: false },
  yearsOfExperience: { type: Number, required: false },
  company: { type: String, required: false },
  googleId: { type: String, required: false, unique: true, sparse: true },
  githubId: { type: String, required: false, unique: true, sparse: true },
  role: {
    type: String,
    enum: ['SYS admin', 'Malware analyst', 'developer', 'other'],
    default: 'other'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema); 