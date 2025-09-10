import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function lobbyRoutes(fastify: FastifyInstance) {
  // Lobby Stats
  fastify.get("/api/lobby/stats", async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const matches = await prisma.match.findMany({
      where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
    });

    const totalMatches = matches.length;
    const wins = matches.filter(m => m.winnerId === userId).length;
    const losses = totalMatches - wins;
    const draws = 0;
    const winRate = totalMatches ? Math.round((wins / totalMatches) * 100) : 0;
    const monthlyWins = matches.filter(m =>
      m.winnerId === userId && m.playedAt.getMonth() === new Date().getMonth()
    ).length;
    const currentWinStreak = 0;

    reply.send({ totalMatches, wins, losses, draws, winRate, currentWinStreak, monthlyWins });
  });

  // Friends
  fastify.get("/api/lobby/friends", async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: "Friend" },
          { receiverId: userId, status: "Friend" },
        ],
      },
      include: { sender: true, receiver: true },
    });

    const friendList = friendships
      .map(f => f.senderId === userId ? f.receiver : f.sender)
      .map(friend => ({
        id: friend.id,
        name: friend.name,
        status: friend.online_status ?? "offline",
        lastActive: friend.last_activity ?? null,
        avatarUrl: friend.avatarUrl,
        email: friend.email,
      }));

    reply.send(friendList);
  });

  // Recent Matches
  fastify.get("/api/lobby/recent-matches", async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const matches = await prisma.match.findMany({
      where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
      orderBy: { playedAt: "desc" },
      take: 10,
    });

    const recentMatches = matches.map(match => {
      const opponent = match.player1Id === userId ? match.player2Name : match.player1Name;
      let result = "draw";
      if (match.winnerId === userId) result = "win";
      else if (match.winnerId) result = "loss";
      return {
        id: match.id,
        opponent,
        result,
        score: `${match.player1Score}-${match.player2Score}`,
        playedAt: match.playedAt,
      };
    });

    reply.send(recentMatches);
  });

  // Profile (My Locker)
  fastify.get("/api/lobby/profile", async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.status(404).send({ error: "User not found" });

    reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      wins: user.wins,
      losses: user.losses,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      favAvatar: user.favAvatar,
      language: user.language,
      profilePic: user.profilePic,
      level: user.level,
    });
  });

  // Update Profile (My Locker Form)
  fastify.post("/api/lobby/profile", async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const body = request.body as {
      firstName?: string;
      lastName?: string;
      avatarUrl?: string;
      dateOfBirth?: string;
      gender?: string;
      favAvatar?: string;
      language?: string;
      profilePic?: string;
      level?: string;
    };

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        avatarUrl: body.avatarUrl,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
        gender: body.gender,
        favAvatar: body.favAvatar,
        language: body.language,
        profilePic: body.profilePic,
        level: body.level,
      },
    });
    reply.send({ success: true, user });
  });

  // Friend Requests
  fastify.get("/api/lobby/friend-requests", async (request, reply) => {
    const userId = request.userId;
    if (!userId) return reply.status(401).send({ error: "Unauthorized" });

    const requests = await prisma.friendship.findMany({
      where: { receiverId: userId, status: "Pending" },
      include: { sender: true },
    });

    reply.send(
      requests.map(req => ({
        id: req.id,
        sender_username: req.sender.name,
        sender_email: req.sender.email,
      }))
    );
  });

  // Leaderboard
  fastify.get("/api/lobby/leaderboard", async (request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { wins: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        wins: true,
        losses: true,
        level: true,
      }
    });
    reply.send(users);
  });

fastify.get("/api/avatars", async (request, reply) => {
    reply.send([
      { id: 'fire', name: 'Fire', imageUrl: '/avatars/starboy.png', color: 'bg-red-500' },
      { id: 'cool', name: 'Cool', imageUrl: '/avatars/skyboy.jpg', color: 'bg-blue-500' },
      { id: 'star', name: 'Star', imageUrl: '/avatars/playboy.webp', color: 'bg-yellow-500' },
      { id: 'rocket', name: 'Rocket', imageUrl: '/avatars/rocket.png', color: 'bg-purple-500' },
      { id: 'crown', name: 'Crown', imageUrl: '/avatars/fungirl.webp', color: 'bg-yellow-600' },
      { id: 'lightning', name: 'Lightning', imageUrl: '/avatars/naughtygirl.webp', color: 'bg-indigo-500' },
      // Add more as needed!
    ]);
  });
  
}