# Real-time Packet Monitoring with Proto Support

This application supports real-time packet monitoring via Server-Sent Events (SSE) with optional Protocol Buffer (protobuf) decoding for binary packets.

## Features

- **Real-time Streaming**: Connect to a backend server to receive packets in real-time
- **Binary Packet Decoding**: Upload `.proto` files to decode binary packet data
- **PCAP File Upload**: Upload packet capture files to the server for processing
- **JSON File Import**: Load previously saved packet data
- **Drag & Drop Support**: All file uploads support drag-and-drop
- **Persistent Configuration**: Server address and proto files are saved to localStorage
- **Dual Data Support**: Handles both JSON and binary protobuf packets

## How to Use

### 1. Start Monitoring

1. Click the **Play** button (Green arrow) in the sidebar
2. A modal will appear asking for the **Server Address**
3. Enter the address of your backend server (default: `http://localhost:1985`)
4. Click **Connect**

### 2. Upload Proto File (Optional)

If your server sends binary packets that need protobuf decoding:

1. Click the **Book** icon in the sidebar (Proto Upload button)
2. **Drag & drop** one or more `.proto` files, or click to select
3. Files are validated and combined automatically
4. A result popup shows:
   - Number of proto files successfully built
   - Number of cmdId mappings found
   - Any errors encountered
5. The proto files will be saved to localStorage and used for all future sessions

**Proto File Format Requirements:**
- Must contain CmdId comments before message definitions
- Example format:
  ```protobuf
  // CmdId: 1001
  message PlayerLoginReq {
      string username = 1;
      string password = 2;
  }
  ```

### 3. Upload PCAP File (Optional)

To upload packet capture files to the server for processing:

**⚠️ Important: Real-time monitoring must be active before uploading PCAP files!**

1. **Start monitoring first** by clicking the Play button and connecting to the server
2. Click the **PCAP** icon in the sidebar (File icon)
3. **Drag & drop** one or more PCAP files, or click to select
4. Supported formats: `.gcap`, `.pcap`, `.pcapng`
5. Files are uploaded to the server's `/api/upload` endpoint
6. A result popup shows:
   - Number of PCAP files successfully uploaded
   - Any upload errors
7. The server will process the PCAP files and stream packets via the active SSE connection

**Note:** If you try to upload without monitoring active, you'll see a warning message. The PCAP packets will be sent through the `packetNotify` event stream, so the connection must be established first.

### 4. Upload JSON File (Optional)

To load previously saved packet data:

1. Click the **Upload** icon in the sidebar (Upload arrow)
2. **Drag & drop** one or more `.json` files, or click to select
3. Files are validated as JSON arrays
4. A result popup shows:
   - Number of JSON files successfully loaded
   - Number of packets imported
   - Any parsing errors
5. Multiple JSON files are combined into a single packet list

### 5. During Monitoring

- The Play button will change to a **Stop** button (Red square)
- Packets streamed from the server will automatically appear in the packet table
- **Binary packets** (where `data === ""` but `binary` exists) will be decoded using the uploaded proto file
- **JSON packets** will be displayed as-is

### 6. Auto-Scroll Feature

To automatically scroll to the latest packet when new packets arrive:

1. Click the **Auto Scroll** button (Down arrow icon) in the sidebar
2. When active, the button will turn **green** with a left border indicator
3. The table will automatically scroll to the bottom whenever new packets arrive
4. Click again to disable auto-scroll and manually navigate the packet list

### 7. Stop Monitoring

- Click the **Stop** button in the sidebar
- The connection will close and the backend `/api/stop` endpoint will be called
- The button will revert to the Play icon

## Technical Details

### Protocol
- **Transport**: Server-Sent Events (EventSource)
- **Encoding**: Supports both JSON and base64-encoded protobuf binary

### API Endpoints
- `GET /api/stream`: The SSE stream endpoint that sends `packetNotify` events
- `GET /api/start`: Signal to backend to start packet capture
- `GET /api/stop`: Signal to backend to stop packet capture
- `POST /api/upload`: Upload PCAP files (.gcap, .pcap, .pcapng) for server-side processing

### Packet Format

The server should send events in this format:

```javascript
event: packetNotify
data: {
  "packetId": 1001,
  "packetName": "PlayerLoginReq",  // Optional if using proto
  "data": "",                       // Empty string for binary packets
  "binary": "base64EncodedData",    // Base64 encoded protobuf binary
  "time": 1234567890,
  "source": "client",               // "client" or "server"
  "length": 256
}
```

**For JSON packets:**
```javascript
{
  "packetId": 1001,
  "packetName": "PlayerLoginReq",
  "data": "{\"username\":\"test\",\"password\":\"123\"}",
  "time": 1234567890,
  "source": "client",
  "length": 45
}
```

### Proto Decoding Logic

1. When a packet arrives with `data === ""` and `binary` field present:
   - Look up the proto message name using `cmdIdToMessageMap[packetId]`
   - Decode the base64 binary data using `protobufjs`
   - Convert the decoded message to JSON
   - Display in the packet table

2. When a packet has JSON data:
   - Parse and display directly

### PCAP Upload

PCAP files are uploaded to the server using multipart/form-data:
- Files are sent to `POST /api/upload`
- Server processes the PCAP and streams packets via `/api/stream`
- Supports multiple file formats: `.gcap`, `.pcap`, `.pcapng`

### LocalStorage Keys

- `packet_monitor_server_address`: Stores the last connected server address
- `protoFileContent`: Stores the uploaded proto file content for persistence

## Dependencies

- `protobufjs`: For binary packet decoding (automatically installed)
- Native `EventSource`: For SSE connection (built into browsers)

## Example Usage

1. **Start your backend server** on `http://localhost:1985`
2. **Upload a proto file** if your server sends binary packets
3. **Upload a PCAP file** or **Click Play** to start real-time monitoring
4. **Watch packets** appear in the table
5. **Click Stop** when done

## Troubleshooting

- **"No proto mapping for packetId X"**: Upload a proto file that includes this packet ID
- **"Failed to start backend capture"**: Ensure your server is running and accessible
- **"Connection lost"**: Check your server logs and network connection
- **Proto parsing errors**: Verify your proto file syntax and CmdId comments
- **PCAP upload fails**: Check server logs and ensure `/api/upload` endpoint is implemented
