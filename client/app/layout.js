import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'REST API Demo · Products',
  description:
    'A Next.js App Router frontend demonstrating REST concepts against an Express API: methods, params, status codes, auth and validation.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {/* AuthProvider makes user/token available everywhere via context. */}
        <AuthProvider>
          <Navbar />
          <main className="container">{children}</main>
          <footer className="footer">
            <span>REST API demo client · Next.js App Router</span>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
