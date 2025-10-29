import './globals.css'

export const metadata = {
  title: 'WebRTC 1:1 Communication',
  description: 'Real-time video chat and whiteboard collaboration',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
