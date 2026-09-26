/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {authApi,type AuthUser} from '../services/authApi';
import {ApiError} from '../services/apiClient';
import {settingsApi} from '../services/settingsApi';

type AuthContextValue={user:AuthUser|null;loading:boolean;login:(email:string,password:string)=>Promise<AuthUser>;logout:()=>Promise<void>;refresh:()=>Promise<void>;setUser:(user:AuthUser)=>void};
const AuthContext=createContext<AuthContextValue|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<AuthUser|null>(null);
 const [loading,setLoading]=useState(true);
 const syncSettings=useCallback(async()=>{const settings=await settingsApi.get();localStorage.setItem('sigadn-settings',JSON.stringify(settings))},[]);
 const refresh=useCallback(async()=>{try{const authenticated=await authApi.me();setUser(authenticated);void syncSettings().catch(()=>undefined)}catch(error){if(error instanceof ApiError&&error.status===401)setUser(null);else throw error}},[syncSettings]);
 useEffect(()=>{refresh().catch(()=>setUser(null)).finally(()=>setLoading(false))},[refresh]);
 const login=useCallback(async(email:string,password:string)=>{const authenticated=await authApi.login(email,password);setUser(authenticated);void syncSettings().catch(()=>undefined);return authenticated},[syncSettings]);
 const logout=useCallback(async()=>{try{await authApi.logout()}finally{setUser(null)}},[]);
 const value=useMemo(()=>({user,loading,login,logout,refresh,setUser}),[user,loading,login,logout,refresh]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth(){const context=useContext(AuthContext);if(!context)throw new Error('useAuth requiere AuthProvider');return context}
