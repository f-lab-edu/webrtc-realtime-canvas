module.exports = {
  apps: [
    {
      name: "nextjs",
      script: "npm",
      args: "run dev",
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "server",
      script: "npm",
      args: "run server:dev",
      cwd: "./",
      watch: false,
      env: {
        NODE_ENV: "development",
        MEDIASOUP_ANNOUNCED_IP: "52.78.156.173",
      },
    },
  ],
};
