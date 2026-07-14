import {app} from './app.js';import {env} from './config/env.js';import {prisma} from './config/prisma.js';
const server=app.listen(env.PORT,()=>console.log(`SIGADN API escuchando en http://localhost:${env.PORT}`));
async function shutdown(){server.close();await prisma.$disconnect();process.exit(0)}process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
