import { createServer, Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { io, Socket as ClientSocket } from "socket.io-client";
import { Backend } from "../src/server";

const BASE_DIR_TEST = "./test/_test_basedir/minecraft";

describe('testing websocket server', () => {
  let ioServer: Server, serverSocket: Socket, clientSocket: ClientSocket;
  let be: any;
  let httpServer: HttpServer

  beforeEach((done) => {
    httpServer = createServer();
    ioServer = new Server(httpServer);
    be = new Backend(BASE_DIR_TEST, ioServer, {});
    httpServer.listen(() => {
      const address = httpServer.address();
      if (typeof address !== "string" && address !== null) {
        const port = address.port;
        clientSocket = io(`http://localhost:${port}`);
        ioServer.use((socket, next) => {
          socket.request["user"] = { username: "root" };
          next();
        })
        ioServer.on("connection", (socket) => {
          serverSocket = socket;
        });
        clientSocket.on("connect", done);
      }
    });
  });

  afterEach(() => {
    be.shutdown();
    ioServer.close();
    clientSocket.close();
    httpServer.close();
  }, 200);

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