import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { UpdateBanner } from './components/UpdateBanner';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <UpdateBanner />
  </>
);
