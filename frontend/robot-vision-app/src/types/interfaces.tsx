export interface VideoStreamProps {
  streamUrl: string;
  isConnected: boolean;
  onConnectionChange?: (connected: boolean) => void;
}