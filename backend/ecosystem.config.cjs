module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || "rag-backend",
      script: "src/server.js",
      cwd: process.env.APP_DIR
        ? `${process.env.APP_DIR}/backend`
        : "/opt/rag-april/backend",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: Number(process.env.PORT || 5000)
      }
    }
  ]
};
