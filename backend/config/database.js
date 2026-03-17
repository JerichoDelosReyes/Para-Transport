const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the MONGODB_URI environment variable
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is not set. Please define it before starting the application.');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      // Mongoose 8.x uses these options by default, but explicitly setting for clarity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB error: ${err}`);
});

module.exports = connectDB;
