import type {Role,UserStatus} from '@prisma/client';

declare global{
  namespace Express{
    interface Request{
      auth?:{userId:string;sessionId:string;username:string|null;role:Role;status:UserStatus};
    }
  }
}
export {};
