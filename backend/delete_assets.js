const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://itdeskvirtuoso_db_user:vpel@cluster0.mq1qghc.mongodb.net/assetdata';

const assetSchema = new mongoose.Schema({}, { strict: false });
const Asset = mongoose.model('Asset', assetSchema);

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB.');
    const result = await Asset.deleteMany({});
    console.log(`Successfully deleted ${result.deletedCount} assets.`);
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
  });
