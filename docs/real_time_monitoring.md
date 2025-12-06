# Real-time Packet Monitoring

This application supports real-time packet monitoring via Server-Sent Events (SSE).

## How to Use

1.  **Start Monitoring**:
    *   Click the **Play** button (Green arrow) in the sidebar.
    *   A prompt will appear asking for the **Server Address**.
    *   Enter the address of your backend server (default: `http://localhost:1985`).
    *   Click **OK**.

2.  **During Monitoring**:
    *   The Play button will change to a **Stop** button (Red square).
    *   Packets streamed from the server will automatically appear in the packet table.
    *   The application listens to the `/api/stream` endpoint of the provided server.

3.  **Stop Monitoring**:
    *   Click the **Stop** button in the sidebar.
    *   The connection will close, and the button will revert to the Play icon.

## Technical Details

*   **Protocol**: Server-Sent Events (EventSource).
*   **Endpoints**:
    *   `GET /api/stream`: The SSE stream endpoint.
    *   `GET /api/start`: backend signal to start capture.
    *   `GET /api/stop`: backend signal to stop capture.
*   **Packet Format**:
    *   The client expects JSON data in the `data` field of the event.
    *   It supports nested JSON parsing for the inner `data` field of the packet.

## Dependencies

*   No external libraries are required for the connection (uses native `EventSource`).
