import './globals.css';

export const metadata = {
  title: 'ClipFlix: turn long videos into shorts',
  description: 'Find the viral moments in your video, caption them, and export 9:16 shorts.',
};

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <head>
        <link rel='stylesheet' href='https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&display=swap' />
      </head>
      <body>{children}</body>
    </html>
  );
}
