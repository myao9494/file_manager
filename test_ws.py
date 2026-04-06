import asyncio
import websockets
import json

async def test_ws():
    uri = "ws://127.0.0.1:8010/api/terminal/ws?cwd=C:/"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected!")
            
            # Send a resize message
            msg = json.dumps({"type": "resize", "cols": 80, "rows": 24})
            print(f"Sending: {msg}")
            await websocket.send(msg)
            
            # Read output
            while True:
                response = await websocket.recv()
                print("Received:", response)
    except Exception as e:
        print("Failed:", e)

asyncio.run(test_ws())
