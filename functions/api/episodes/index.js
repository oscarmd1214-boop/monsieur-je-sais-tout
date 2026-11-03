import { json, readBody, getSession } from "../../_shared.js";

const RSS_URL = "https://anchor.fm/s/1145217f4/podcast/rss";

function decodeXML(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .trim();
}

function getTag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, "i")
  );

  return match ? decodeXML(match[1]) : "";
}

function getAttribute(xml, tagName, attribute) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttr = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const tag = xml.match(new RegExp(`<${escapedTag}\\b[^>]*>`, "i"));
  if (!tag) return "";

  const match = tag[0].match(
    new RegExp(`${escapedAttr}\\s*=\\s*["']([^"']+)["']`, "i")
  );

  return match ? decodeXML(match[1]) : "";
}

function cleanDescription(value) {
  return decodeXML(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 1200);
}

function parseEpisodes(xml) {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];

  return items.map((item) => {
    const audio = getAttribute(item, "enclosure", "url");
    const guid = getTag(item, "guid") || audio;
    const image =
      getAttribute(item, "itunes:image", "href") ||
      getTag(item, "itunes:image");

    return {
      id: guid,
      title: getTag(item, "title") || "Épisode sans titre",
      description: cleanDescription(
        getTag(item, "description") ||
        getTag(item, "content:encoded") ||
        getTag(item, "itunes:summary")
      ),
      date: getTag(item, "pubDate"),
      image: image || "",
      audio,
      duration: getTag(item, "itunes:duration"),
      plays: 0
    };
  }).filter((episode) => episode.audio && episode.id);
}

async function fetchEpisodes() {
  const response = await fetch(RSS_URL, {
    headers: { "User-Agent": "MonsieurJeSaisTout/1.0" }
  });

  if (!response.ok) {
    throw new Error("Le flux RSS est indisponible.");
  }

  const xml = await response.text();
  return parseEpisodes(xml);
}

export async function onRequestGet({ request, env }) {
  try {
    const episodes = await fetchEpisodes();

    const counts = await env.DB.prepare(
      "SELECT episode_id, plays FROM episode_plays"
    ).all();

    const playMap = new Map(
      (counts.results || []).map((row) => [row.episode_id, row.plays])
    );

    const result = episodes.map((episode) => ({
      ...episode,
      plays: playMap.get(episode.id) || 0
    }));

    return json({ episodes: result });
  } catch (error) {
    return json({
      error: error.message || "Impossible de charger les épisodes."
    }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await getSession(request, env);

  if (!user) {
    return json({ error: "Connecte-toi pour enregistrer ton historique." }, 401);
  }

  const body = await readBody(request);
  const episodeId = body?.episodeId;

  if (typeof episodeId !== "string" || !episodeId || episodeId.length > 1000) {
    return json({ error: "Épisode invalide." }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO episode_plays (episode_id, plays)
       VALUES (?, 1)
       ON CONFLICT(episode_id)
       DO UPDATE SET plays = plays + 1`
    ).bind(episodeId).run();

    await env.DB.prepare(
      `INSERT INTO listening_history (user_id, episode_id, listened_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, episode_id)
       DO UPDATE SET listened_at = excluded.listened_at`
    ).bind(user.id, episodeId, Date.now()).run();

    return json({ success: true });
  } catch {
    return json({ error: "Impossible d'enregistrer cette écoute." }, 500);
  }
}
