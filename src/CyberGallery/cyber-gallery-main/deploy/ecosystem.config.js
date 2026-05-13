module.exports = {
  apps: [
    {
      name: 'cg-api',
      cwd: '/srv/cyber-gallery/apps/api',
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 4817,
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_DB: 3,
        // REDIS_PASSWORD intentionally NOT set here — keep secrets in apps/api/.env
      },
      max_memory_restart: '700M',
      out_file: '/var/log/cg/api.out.log',
      error_file: '/var/log/cg/api.err.log',
      time: true,
    },
    {
      name: 'cg-web',
      cwd: '/srv/cyber-gallery/apps/web',
      // Next.js standalone server. We run `next start` for simplicity.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '700M',
      out_file: '/var/log/cg/web.out.log',
      error_file: '/var/log/cg/web.err.log',
      time: true,
    },
  ],
};
