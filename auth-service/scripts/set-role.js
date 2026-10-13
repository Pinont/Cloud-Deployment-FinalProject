// Usage: MONGO_URI=... npm run set-role -- <email> <user|owner|admin>
// Makes the first admin (or fixes a role) directly in the database; HTTP role changes need an admin.
const mongoose = require('mongoose');
const User = require('../src/models/User');

const [email, role] = process.argv.slice(2);
const ROLES = ['user', 'owner', 'admin'];

async function main() {
  if (!process.env.MONGO_URI || !email || !ROLES.includes(role)) {
    throw new Error(`Usage: MONGO_URI=... npm run set-role -- <email> <${ROLES.join('|')}>`);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate({ email: email.trim().toLowerCase() }, { role }, { new: true });
  if (!user) {
    throw new Error(`No user with email ${email}`);
  }
  console.log(`${user.email} is now ${user.role}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
