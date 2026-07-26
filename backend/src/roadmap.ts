import { db } from "./db";
import { generateJSON } from "./llm";
import { getFile } from "./storage";
import crypto from "crypto";
import type { PlaylistVideo } from "./youtube";

export interface RoadmapStageResult {
  id: string;
  roadmapId: string;
  order: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  outcomes: string[];
  videoIds: string[];
  completed: boolean;
}

export interface RoadmapResult {
  id: string;
  notebookId: string;
  sourceId: string;
  title: string;
  stages: RoadmapStageResult[];
  createdAt: string;
}

export async function generateRoadmap(
  notebookId: string,
  sourceId: string,
  regenerate: boolean = false
): Promise<RoadmapResult> {
  if (!regenerate) {
    const existing = await db.roadmap.findFirst({
      where: { notebookId, sourceId },
      include: { stages: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return {
        id: existing.id,
        notebookId: existing.notebookId,
        sourceId: existing.sourceId,
        title: existing.title,
        stages: existing.stages.map(s => ({
          id: s.id,
          roadmapId: s.roadmapId,
          order: s.order,
          title: s.title,
          description: s.description,
          estimatedMinutes: s.estimatedMinutes,
          outcomes: JSON.parse(s.outcomes),
          videoIds: JSON.parse(s.videoIds),
          completed: s.completed,
        })),
        createdAt: existing.createdAt.toISOString(),
      };
    }
  }

  // Fetch the source to get the playlist data
  const source = await db.source.findUnique({
    where: { id: sourceId, notebookId }
  });

  if (!source || (source.type !== 'youtube_playlist' && source.type !== 'YOUTUBE_PLAYLIST')) {
    throw new Error("Source not found or is not a youtube_playlist.");
  }

  if (!source.rawContentRef) {
    throw new Error("Playlist content file reference is missing.");
  }

  let playlistData: { playlistTitle: string, videos: PlaylistVideo[] };
  try {
    const fileBuffer = await getFile(source.rawContentRef);
    playlistData = JSON.parse(fileBuffer.toString("utf-8"));
  } catch (e) {
    throw new Error(`Failed to parse playlist data from source storage: ${(e as Error).message}`);
  }

  const videos = playlistData.videos;
  if (!videos || videos.length === 0) {
    throw new Error("Playlist has no videos.");
  }

  const videosContext = videos.map(v => {
    const excerpt = v.transcript ? v.transcript.slice(0, 500).replace(/\n/g, ' ') : "(no transcript available)";
    return `- [${v.position}] ${v.title}\n  transcript excerpt: ${excerpt}`;
  }).join("\n\n");

  const prompt = `
You are designing a learning roadmap from a YouTube playlist. Group the following videos (given in original playlist order, with titles and transcript excerpts) into logical learning stages — do not just echo the flat list, actually cluster related videos and order stages from foundational to advanced.

VIDEOS (in order):
${videosContext}

Rules:
- Preserve overall progression order (don't move an advanced video before its prerequisite), but you MAY group multiple adjacent videos into one stage if they cover the same subtopic.
- Each stage needs: a short title, a 1-3 sentence description, 2-4 "outcomes" (things the learner can do after this stage), and the list of videoPositions (by position) it covers.
- Estimate total stages based on content breadth — don't force an arbitrary number; typical range is 4-10 stages for a playlist of 20-50 videos.

Return ONLY JSON matching schema:
{
  "title": string,
  "stages": [
    {
      "title": string,
      "description": string,
      "outcomes": string[],
      "videoPositions": number[]
    }
  ]
}
`;

  let stagesData: any[] = [];
  let roadmapTitle = playlistData.playlistTitle;

  try {
    const parsed = await generateJSON<{ title?: string; stages?: any[] }>(
      prompt,
      "You are a curriculum designer. Always return valid JSON matching the schema.",
      "openai/gpt-4o-mini"
    );
    
    if (parsed.title) {
      roadmapTitle = parsed.title;
    }

    if (parsed.stages && Array.isArray(parsed.stages)) {
      stagesData = parsed.stages;
    }
  } catch (err) {
    console.warn("Failed to generate roadmap from LLM, using fallback", err);
    // Fallback: group every 5 videos into a stage
    stagesData = [];
    for (let i = 0; i < videos.length; i += 5) {
      const chunk = videos.slice(i, i + 5);
      const firstPos = chunk[0]?.position ?? 0;
      const lastPos = chunk[chunk.length - 1]?.position ?? 0;
      stagesData.push({
        title: `Module ${Math.floor(i / 5) + 1}`,
        description: `Covers videos ${firstPos + 1} to ${lastPos + 1}.`,
        outcomes: ["Understand the key concepts introduced in this series of videos."],
        videoPositions: chunk.map(v => v.position)
      });
    }
  }

  if (regenerate) {
    await db.roadmap.deleteMany({
      where: { notebookId, sourceId }
    });
  }

  const savedRoadmap = await db.roadmap.create({
    data: {
      notebookId,
      sourceId,
      title: roadmapTitle,
      stages: {
        create: stagesData.map((stage: any, index: number) => {
          // map positions back to videoIds
          const stageVideoIds = (stage.videoPositions || [])
            .map((pos: number) => videos.find(v => v.position === pos)?.videoId)
            .filter(Boolean);
            
          // calculate estimated minutes
          const stageVideos = videos.filter(v => stageVideoIds.includes(v.videoId));
          let estimatedMinutes = 0;
          for (const v of stageVideos) {
            estimatedMinutes += Math.ceil((v.durationSeconds || (8 * 60)) / 60);
          }
          if (estimatedMinutes === 0) {
             estimatedMinutes = stageVideoIds.length * 8; // fallback 8 mins per video
          }

          return {
            order: index + 1,
            title: String(stage.title),
            description: String(stage.description),
            estimatedMinutes,
            outcomes: JSON.stringify(stage.outcomes || []),
            videoIds: JSON.stringify(stageVideoIds),
            completed: false
          };
        })
      }
    },
    include: { stages: { orderBy: { order: "asc" } } }
  });

  return {
    id: savedRoadmap.id,
    notebookId: savedRoadmap.notebookId,
    sourceId: savedRoadmap.sourceId,
    title: savedRoadmap.title,
    stages: savedRoadmap.stages.map(s => ({
      id: s.id,
      roadmapId: s.roadmapId,
      order: s.order,
      title: s.title,
      description: s.description,
      estimatedMinutes: s.estimatedMinutes,
      outcomes: JSON.parse(s.outcomes),
      videoIds: JSON.parse(s.videoIds),
      completed: s.completed,
    })),
    createdAt: savedRoadmap.createdAt.toISOString(),
  };
}

export async function getRoadmaps(notebookId: string): Promise<RoadmapResult[]> {
  const records = await db.roadmap.findMany({
    where: { notebookId },
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  
  return records.map(record => ({
    id: record.id,
    notebookId: record.notebookId,
    sourceId: record.sourceId,
    title: record.title,
    stages: record.stages.map(s => ({
      id: s.id,
      roadmapId: s.roadmapId,
      order: s.order,
      title: s.title,
      description: s.description,
      estimatedMinutes: s.estimatedMinutes,
      outcomes: JSON.parse(s.outcomes),
      videoIds: JSON.parse(s.videoIds),
      completed: s.completed,
    })),
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function updateRoadmapStage(
  roadmapId: string,
  stageId: string,
  completed: boolean
): Promise<void> {
  await db.roadmapStage.update({
    where: { id: stageId, roadmapId },
    data: { completed }
  });
}

export async function deleteRoadmap(roadmapId: string, notebookId: string): Promise<void> {
  await db.roadmap.deleteMany({
    where: { id: roadmapId, notebookId },
  });
}
