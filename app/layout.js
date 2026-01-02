import "./globals.css";
import { ChatProvider, MediaProvider, RoomProvider, SFUProvider } from "@/contexts";

export const metadata = {
  title: "WebRTC 1:1 Communication",
  description: "Real-time video chat and whiteboard collaboration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <RoomProvider>
          <SFUProvider>
            <MediaProvider>
              <ChatProvider>{children}</ChatProvider>
            </MediaProvider>
          </SFUProvider>
        </RoomProvider>
      </body>
    </html>
  );
}
