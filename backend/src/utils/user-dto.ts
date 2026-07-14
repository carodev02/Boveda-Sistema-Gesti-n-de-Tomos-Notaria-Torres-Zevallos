type PublicUserSource={
  id:string;
  username:string|null;
  email:string;
  fullName:string;
  phone:string|null;
  avatarUrl:string|null;
  role:string;
  status:string;
  lastAccessAt:Date|null;
  createdAt:Date;
  passwordResetRequired:boolean;
};

export function publicUser(user:PublicUserSource){
  return {
    id:user.id,
    username:user.username,
    email:user.email,
    fullName:user.fullName,
    phone:user.phone,
    avatarUrl:user.avatarUrl,
    role:user.role,
    status:user.status,
    lastAccessAt:user.lastAccessAt,
    createdAt:user.createdAt,
    passwordResetRequired:user.passwordResetRequired
  };
}
