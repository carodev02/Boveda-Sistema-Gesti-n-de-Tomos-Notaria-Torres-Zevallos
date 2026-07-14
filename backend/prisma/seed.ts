import 'dotenv/config';
import {PrismaClient,Role,UserStatus} from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma=new PrismaClient();
const username=(process.env.SEED_ADMIN_USERNAME??'notario').toLowerCase();const email=(process.env.SEED_ADMIN_EMAIL??'notario@notariatorres.pe').toLowerCase();const password=process.env.SEED_ADMIN_PASSWORD;
if(!password||password.length<12)throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
const passwordHash=await bcrypt.hash(password,12);
await prisma.user.upsert({where:{username},update:{email,fullName:'Notario principal',passwordHash,role:Role.NOTARIO,status:UserStatus.ACTIVO,protectedAccount:true,passwordResetRequired:false,tempPasswordExpiresAt:null},create:{username,email,fullName:'Notario principal',passwordHash,role:Role.NOTARIO,status:UserStatus.ACTIVO,protectedAccount:true,passwordResetRequired:false}});
console.log(`Cuenta inicial preparada: ${username} (${Role.NOTARIO}).`);await prisma.$disconnect();
