import { FastifyInstance } from "fastify";

// In-memory online tracking
const onlineUsers: { id: string, name: string, status: "online" | "in_game" }[] = [];

// Call these functions on login/logout/game start/game end
export function setUserOnline(id: string, name: string) {
  if (!onlineUsers.find(u => u.id === id)) {
    onlineUsers.push({ id, name, status: "online" });
  }
}

export function setUserInGame(id: string) {
  const user = onlineUsers.find(u => u.id === id);
  if (user) user.status = "in_game";
}

export function setUserOffline(id: string) {
  const idx = onlineUsers.findIndex(u => u.id === id);
  if (idx !== -1) onlineUsers.splice(idx, 1);
}

export default function friendsRoutes(fastify: FastifyInstance) {
  fastify.get('/friends/online', async (request, reply) => {
    // You can filter to only return friends of the logged-in user if you like
    return reply.send(onlineUsers);
  });
}