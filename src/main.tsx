import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import App from './App';
import './index.css';

const publishableKey =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_CLERK_PUBLISHABLE_KEY ||
  (import.meta as unknown as { env?: Record<string, string> }).env?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  '';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={publishableKey}
        appearance={{
          theme: dark,
          variables: {
            colorPrimary: '#F64302',
            colorPrimaryForeground: '#000000',
            colorBackground: '#0c0d11',
            colorInput: '#13151b',
            colorInputForeground: '#ffffff',
            colorForeground: '#ffffff',
            colorNeutral: '#ffffff',
            borderRadius: '0.75rem',
            fontFamily: 'JetBrains Mono, monospace',
          },
        }}
      >
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
}
