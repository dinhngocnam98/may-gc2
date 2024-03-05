module.exports = {
  apps: [
    {
      name: 'read-file-app',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      merge_logs: true,
      env: {
        DATABASE_URL:
          'mongodb://readTXT:Admin%40123@10.86.5.132:27017/Reports',
        PORT: 4000,
      },
    },
  ],
};
