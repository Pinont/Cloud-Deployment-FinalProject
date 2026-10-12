const { createApp } = require('./app');

const app = createApp();
const port = process.env.PORT || 3004;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`favorite-service listening on port ${port}`);
});
