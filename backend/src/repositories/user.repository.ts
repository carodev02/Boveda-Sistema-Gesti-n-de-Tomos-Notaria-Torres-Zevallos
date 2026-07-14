import {prisma} from '../config/prisma.js';
export const userRepository={findById:(id:string)=>prisma.user.findUnique({where:{id}}),findByIdentity:(email:string)=>prisma.user.findUnique({where:{email:email.toLowerCase()}}),listActive:()=>prisma.user.findMany({where:{deletedAt:null},orderBy:{createdAt:'desc'}})};
