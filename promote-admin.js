const { Client } = require("pg");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`
    UPDATE users
    SET role = 'admin',
        "subscriptionTier" = 'PRO',
        "accountType" = 'paid'
    WHERE email = 'michaeltalbert@hotmail.com';
  `);

  await client.query(`
    INSERT INTO admin_users ("userId")
    SELECT id
    FROM users
    WHERE email = 'michaeltalbert@hotmail.com'
      AND NOT EXISTS (
        SELECT 1
        FROM admin_users au
        WHERE au."userId" = users.id
      );
  `);

  const result = await client.query(`
    SELECT email, role, "subscriptionTier", "accountType"
    FROM users
    WHERE email = 'michaeltalbert@hotmail.com';
  `);

  console.log(result.rows);
  await client.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
