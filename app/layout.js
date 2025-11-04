import "./globals.css";
import { MediaProvider } from "@/contexts/MediaContext";
import { RoomProvider } from "@/contexts/RoomContext";

export const metadata = {
  title: "WebRTC 1:1 Communication",
  description: "Real-time video chat and whiteboard collaboration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <RoomProvider>
          <MediaProvider>{children}</MediaProvider>
        </RoomProvider>
      </body>
    </html>
  );
}
