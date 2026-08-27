const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://itdeskvirtuoso_db_user:vpel@cluster0.mq1qghc.mongodb.net/assetdata';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    try {
        await mongoose.connection.db.dropCollection('users');
        console.log('Users collection dropped.');
    } catch(err) {
        console.log('Users collection drop failed:', err.message);
    }
    try {
        await mongoose.connection.db.dropCollection('roles');
        console.log('Roles collection dropped.');
    } catch(err) {
        console.log('Roles collection drop failed:', err.message);
    }
    process.exit(0);
  })
  .catch(err => {
      console.error(err);
      process.exit(1);
  });
