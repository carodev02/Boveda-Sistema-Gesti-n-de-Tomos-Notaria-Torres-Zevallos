import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {usersApiPlugin} from './server/usersApi';
import {profileApiPlugin} from './server/profileApi';
export default defineConfig({plugins:[react(),profileApiPlugin(),usersApiPlugin()],build:{rollupOptions:{output:{assetFileNames:(assetInfo)=>assetInfo.name?.includes('spa.traineddata')?'assets/spa.traineddata.gz':'assets/[name]-[hash][extname]'}}}});
