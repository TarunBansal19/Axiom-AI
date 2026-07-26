import { describe, test, expect, beforeAll } from "bun:test";
import { db } from "../db";
import { generateFlashcardDeck, getFlashcardDecks } from "../flashcards";
import { generateQuiz, getQuizzes } from "../quiz";
import { generateMindMap, getMindMaps } from "../mindmap";
import { generateRoadmap, getRoadmaps } from "../roadmap";
import { generateOverview, getOverview } from "../overview";
import { putFile } from "../storage";
import crypto from "crypto";

describe("AxiomAI Studio Features Integration Tests", () => {
  let testNotebookId: string;
  let textSourceId: string;
  let playlistSourceId: string;

  beforeAll(async () => {
    // 1. Create a test notebook
    const notebook = await db.notebook.create({
      data: { name: "Artificial Intelligence & Neural Networks Research" },
    });
    testNotebookId = notebook.id;

    // 2. Create a test text source with rich content
    const textSource = await db.source.create({
      data: {
        notebookId: testNotebookId,
        type: "TEXT",
        originalUri: "ai_overview.txt",
        title: "Deep Learning Foundations and Applications",
        status: "READY",
      },
    });
    textSourceId = textSource.id;

    // Create chunks for the text source
    const sampleTexts = [
      "Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to intelligence of humans. Key subfields include machine learning, deep learning, and natural language processing.",
      "Neural networks are computing systems inspired by biological neural networks. They consist of input layers, hidden layers, and output layers, using backpropagation to adjust weights based on loss calculation.",
      "Transformers are a deep learning model architecture introduced in 2017. They rely on self-attention mechanisms to process sequential data in parallel, revolutionizing natural language processing and computer vision.",
      "Reinforcement learning is an area of machine learning concerned with how intelligent agents ought to take actions in an environment in order to maximize cumulative reward.",
      "Convolutional Neural Networks (CNNs) are specialized neural networks designed to process grid-structured data like image pixels, using convolution kernels for feature extraction.",
      "Large Language Models (LLMs) are trained on massive text corpora using self-supervised learning, enabling capabilities like text generation, reasoning, code synthesis, and translation."
    ];

    for (let i = 0; i < sampleTexts.length; i++) {
      await db.chunk.create({
        data: {
          id: crypto.randomUUID(),
          sourceId: textSourceId,
          notebookId: testNotebookId,
          text: sampleTexts[i]!,
          chunkIndex: i,
          location: JSON.stringify({ type: "text", charStart: i * 150, charEnd: (i + 1) * 150 }),
        },
      });
    }

    // 3. Create a test youtube_playlist source
    const mockPlaylistData = {
      playlistTitle: "Complete Deep Learning Course 2026",
      videos: [
        { videoId: "vid001", title: "Intro to Neural Networks", position: 0, transcript: "Welcome to neural networks basics. We cover perceptrons, activation functions like ReLU and Sigmoid, and forward propagation.", durationSeconds: 600 },
        { videoId: "vid002", title: "Backpropagation & Optimization", position: 1, transcript: "In this lesson we explore gradient descent, Adam optimizer, and calculating partial derivatives through backpropagation.", durationSeconds: 900 },
        { videoId: "vid003", title: "Convolutional Networks for Computer Vision", position: 2, transcript: "CNN architectures including ResNet and VGG. Pooling layers, stride, and image feature maps.", durationSeconds: 1200 },
        { videoId: "vid004", title: "Recurrent Networks and LSTMs", position: 3, transcript: "Sequence processing, vanishing gradients, long short-term memory networks and gated recurrent units.", durationSeconds: 800 },
        { videoId: "vid005", title: "Attention Mechanisms and Transformers", position: 4, transcript: "Self-attention mechanism, multi-head attention, positional encoding, and the Encoder-Decoder transformer architecture.", durationSeconds: 1500 },
      ]
    };

    const playlistKey = `sources/test_playlist_${Date.now()}.json`;
    await putFile(playlistKey, Buffer.from(JSON.stringify(mockPlaylistData), "utf-8"));

    const playlistSource = await db.source.create({
      data: {
        notebookId: testNotebookId,
        type: "youtube_playlist",
        originalUri: "https://www.youtube.com/playlist?list=PL123456789",
        title: "Complete Deep Learning Course 2026",
        status: "READY",
        rawContentRef: playlistKey,
      },
    });
    playlistSourceId = playlistSource.id;
  });

  test("1. Flashcard Generation & Persistence", async () => {
    const deck = await generateFlashcardDeck(testNotebookId, [textSourceId], 10, true);
    expect(deck.id).toBeDefined();
    expect(deck.notebookId).toBe(testNotebookId);
    expect(deck.cards.length).toBeGreaterThanOrEqual(5);

    const firstCard = deck.cards[0]!;
    expect(firstCard.question).toBeDefined();
    expect(firstCard.question.length).toBeGreaterThan(5);
    expect(firstCard.answer).toBeDefined();
    expect(firstCard.answer.length).toBeGreaterThan(5);

    // Verify caching retrieval
    const fetchedDecks = await getFlashcardDecks(testNotebookId);
    expect(fetchedDecks.length).toBeGreaterThan(0);
    expect(fetchedDecks[0]?.id).toBe(deck.id);
  }, 40000);

  test("2. Quiz Generation & Option Structure", async () => {
    const quiz = await generateQuiz(testNotebookId, [textSourceId], 10, true);
    expect(quiz.id).toBeDefined();
    expect(quiz.questions.length).toBeGreaterThanOrEqual(5);

    const q1 = quiz.questions[0]!;
    expect(q1.prompt).toBeDefined();
    expect(q1.options.length).toBe(4);
    expect(['A', 'B', 'C', 'D']).toContain(q1.correctOptionId);

    for (const opt of q1.options) {
      expect(opt.id).toBeDefined();
      expect(opt.label).toBeDefined();
      expect(opt.rationale).toBeDefined();
      expect(opt.rationale.length).toBeGreaterThan(3);
    }

    const cachedQuizzes = await getQuizzes(testNotebookId);
    expect(cachedQuizzes.length).toBeGreaterThan(0);
  }, 40000);

  test("3. Mindmap Hierarchical Tree Generation", async () => {
    const mindMap = await generateMindMap(testNotebookId, [textSourceId], true);
    expect(mindMap.id).toBeDefined();
    expect(mindMap.root).toBeDefined();
    expect(mindMap.root.label).toBeDefined();
    expect(mindMap.root.children.length).toBeGreaterThanOrEqual(2);

    const firstChild = mindMap.root.children[0]!;
    expect(firstChild.label).toBeDefined();
    expect(firstChild.summary).toBeDefined();

    const cachedMindMaps = await getMindMaps(testNotebookId);
    expect(cachedMindMaps.length).toBeGreaterThan(0);
  }, 40000);

  test("4. YouTube Playlist Roadmap Generation", async () => {
    const roadmap = await generateRoadmap(testNotebookId, playlistSourceId, true);
    expect(roadmap.id).toBeDefined();
    expect(roadmap.title).toBeDefined();
    expect(roadmap.stages.length).toBeGreaterThanOrEqual(1);

    const stage1 = roadmap.stages[0]!;
    expect(stage1.title).toBeDefined();
    expect(stage1.description).toBeDefined();
    expect(stage1.outcomes.length).toBeGreaterThan(0);
    expect(stage1.videoIds.length).toBeGreaterThan(0);
    expect(stage1.estimatedMinutes).toBeGreaterThan(0);

    const cachedRoadmaps = await getRoadmaps(testNotebookId);
    expect(cachedRoadmaps.length).toBeGreaterThan(0);
  }, 40000);

  test("5. Notebook Overview Generation", async () => {
    const overview = await generateOverview(testNotebookId, [textSourceId]);
    expect(overview.id).toBeDefined();
    expect(overview.title).toBeDefined();
    expect(overview.summaryMarkdown).toBeDefined();
    expect(overview.summaryMarkdown.length).toBeGreaterThan(20);
    expect(overview.suggestedQuestions.length).toBe(3);

    const cachedOverview = await getOverview(testNotebookId);
    expect(cachedOverview).not.toBeNull();
    expect(cachedOverview?.title).toBe(overview.title);
  }, 40000);
});
