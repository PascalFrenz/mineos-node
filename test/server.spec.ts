import { createServer, Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { io as Client, Socket as ClientSocket } from "socket.io-client";
import { Backend } from "../src/server";

describe('testing websocket server', () => {
  let ioServer: Server, serverSocket: Socket, clientSocket: ClientSocket;
  let be: any;
  let httpServer: HttpServer
  beforeAll((done) => {
    httpServer = createServer();
    ioServer = new Server(httpServer);
    httpServer.listen(() => {
      const address = httpServer.address();
      if (typeof address !== "string" && address !== null) {
        const port = address.port;
        clientSocket = Client(`http://localhost:${port}`);
        ioServer.on("connection", (socket) => {
          serverSocket = socket;
        });
        clientSocket.on("connect", done);
      }
    });
    be = new Backend("./test/_test_basedir/minecraft", ioServer, {});
  });

  afterAll((done) => {
    be.shutdown();
    ioServer.close();
    clientSocket.close();
    httpServer.close();
    done();
  });

  test("should receive heartbeat", done => {
    clientSocket.on("host_heartbeat", (heartbeat) => {
      expect(heartbeat).toBeDefined();
      expect(heartbeat).toHaveProperty("uptime");
      expect(heartbeat).toHaveProperty("freemem");
      expect(heartbeat).toHaveProperty("loadavg");
      expect(heartbeat.loadavg).toHaveLength(3);
      done()
    });
  });
});