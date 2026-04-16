'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/theme-toggle';
import { Brain, Send, HelpCircle, CheckCircle2, AlertCircle, XCircle, Sparkles, Loader2, Mic, MicOff, AlertTriangle, RefreshCw, Star, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

type GameMode = 'easy' | 'hard';
type Theme = 'crime' | 'dark horror' | 'logic';

interface Puzzle {
  id: string;
  scenario: string;
  theme: string;
  solution: string;
}

interface Message {
  id: string;
  type: 'question' | 'answer' | 'error' | 'hint';
  content: string;
}

interface SolutionResult {
  status: 'correct' | 'partial' | 'incorrect';
  accuracy: number;
  feedback: string;
  missingElements?: string[];
}

export default function Home() {
  const [gameMode, setGameMode] = useState<GameMode>('hard');
  const [theme, setTheme] = useState<Theme>('crime');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [solutionText, setSolutionText] = useState('');
  const [solutionResult, setSolutionResult] = useState<SolutionResult | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rating state
  const [userRating, setUserRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  const isSolved = solutionResult?.status === 'correct';

  // Scroll to bottom when new message is added
  useEffect(() => {
    if (messages.length > 0 && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setQuestion(transcript);
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const generatePuzzle = async () => {
    setIsLoading(true);
    setError(null);
    setMessages([]);
    setQuestionCount(0);
    setSolutionResult(null);
    setShowSolution(false);
    setSolutionText('');
    setUserRating(0);
    setHoveredStar(0);
    setRatingFeedback('');
    setRatingSubmitted(false);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });

      const data = await response.json();

      if (data.success) {
        setPuzzle(data.puzzle);
      } else {
        setError(data.error || 'Failed to generate puzzle. Please try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || !puzzle || isAsking || isSolved) return;

    const userQuestion = question.trim();
    setQuestion('');

    const questionId = Date.now().toString();
    setMessages(prev => [...prev, { id: questionId, type: 'question', content: userQuestion }]);
    setIsAsking(true);

    try {
      const response = await fetch('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          scenario: puzzle.scenario,
          solution: puzzle.solution,
          conversationHistory: messages.filter(m => m.type === 'question').map((m, i) => ({
            question: m.content,
            answer: messages.filter(m => m.type === 'answer')[i]?.content || ''
          })),
          mode: gameMode,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessages(prev => [...prev, { id: `${questionId}-answer`, type: 'answer', content: data.answer }]);
        setQuestionCount(prev => prev + 1);

        // In easy mode, show hint as a separate message if present
        if (data.hint) {
          setMessages(prev => [...prev, { id: `${questionId}-hint`, type: 'hint', content: data.hint }]);
        }
      } else {
        setMessages(prev => [...prev, { id: `${questionId}-error`, type: 'error', content: data.error || 'Failed to get answer.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { id: `${questionId}-error`, type: 'error', content: 'Connection error. Please try again.' }]);
    } finally {
      setIsAsking(false);
    }
  };

  const submitSolution = async () => {
    if (!solutionText.trim() || !puzzle || isSubmitting || isSolved) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userSolution: solutionText.trim(),
          actualSolution: puzzle.solution,
          scenario: puzzle.scenario
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSolutionResult(data.evaluation);
      } else {
        setError(data.error || 'Failed to evaluate solution.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRating = async () => {
    if (!puzzle || userRating === 0 || isSubmittingRating) return;

    setIsSubmittingRating(true);

    try {
      const response = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puzzleId: puzzle.id,
          scenario: puzzle.scenario,
          theme: puzzle.theme,
          rating: userRating,
          feedback: ratingFeedback.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRatingSubmitted(true);
      }
    } catch {
      // Silent fail for ratings
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  const getAnswerColor = (answer: string) => {
    switch (answer) {
      case 'YES': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'NO': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'NOT RELEVANT': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
      default: return '';
    }
  };

  const getResultIcon = (status: string) => {
    switch (status) {
      case 'correct': return <CheckCircle2 className="h-8 w-8 text-green-500" />;
      case 'partial': return <AlertCircle className="h-8 w-8 text-yellow-500" />;
      case 'incorrect': return <XCircle className="h-8 w-8 text-red-500" />;
      default: return null;
    }
  };

  const getResultTitle = (status: string) => {
    switch (status) {
      case 'correct': return 'Correct!';
      case 'partial': return 'Almost there!';
      case 'incorrect': return 'Not quite...';
      default: return '';
    }
  };

  const resetGame = () => {
    setPuzzle(null);
    setMessages([]);
    setQuestionCount(0);
    setSolutionResult(null);
    setShowSolution(false);
    setSolutionText('');
    setError(null);
    setUserRating(0);
    setHoveredStar(0);
    setRatingFeedback('');
    setRatingSubmitted(false);
  };

  const showRating = (isSolved || showSolution) && puzzle;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">just think</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1">
        {/* Home Screen - No Puzzle Yet */}
        {!puzzle && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-primary/10">
                  <Brain className="h-16 w-16 text-primary" />
                </div>
              </div>
              <h2 className="text-3xl font-bold">Lateral Thinking Puzzles</h2>
              <p className="text-muted-foreground max-w-md">
                AI-generated mysteries for curious minds. Ask yes/no questions to unravel the truth.
              </p>
            </div>

            <Card className="w-full max-w-md">
              <CardContent className="pt-6 space-y-6">
                {/* Game Mode */}
                <div className="space-y-2">
                  <Label>Game Mode</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant={gameMode === 'easy' ? 'default' : 'outline'}
                      className={cn(
                        'w-full justify-center gap-2 h-auto py-3',
                        gameMode === 'easy' && 'border-2 border-primary'
                      )}
                      onClick={() => setGameMode('easy')}
                    >
                      <Lightbulb className="h-4 w-4" />
                      <div className="text-left">
                        <div className="font-semibold text-sm">Easy</div>
                        <div className="text-xs opacity-70">Hints included</div>
                      </div>
                    </Button>
                    <Button
                      type="button"
                      variant={gameMode === 'hard' ? 'default' : 'outline'}
                      className={cn(
                        'w-full justify-center gap-2 h-auto py-3',
                        gameMode === 'hard' && 'border-2 border-primary'
                      )}
                      onClick={() => setGameMode('hard')}
                    >
                      <Brain className="h-4 w-4" />
                      <div className="text-left">
                        <div className="font-semibold text-sm">Hard</div>
                        <div className="text-xs opacity-70">Pure yes/no</div>
                      </div>
                    </Button>
                  </div>
                </div>

                {/* Theme */}
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                    <SelectTrigger id="theme">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crime">Crime</SelectItem>
                      <SelectItem value="dark horror">Dark Horror</SelectItem>
                      <SelectItem value="logic">Logic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={generatePuzzle}
                  className="w-full"
                  size="lg"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Puzzle
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Generating your puzzle...</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex justify-center mb-4">
            <Card className="border-destructive/50 bg-destructive/5 max-w-md">
              <CardContent className="pt-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Puzzle View */}
        {puzzle && !isLoading && (
          <div className="space-y-6">
            {/* Puzzle Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(
                  'capitalize',
                  gameMode === 'easy'
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                )}>
                  {gameMode === 'easy' ? '🟢 Easy' : '🔴 Hard'}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {puzzle.theme}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  {questionCount} questions
                </Badge>
                <Button variant="ghost" size="sm" onClick={resetGame}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>
            </div>

            {/* Two Column Layout for larger screens */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Left: Scenario Card */}
              <Card className="border-2 lg:sticky lg:top-24 lg:self-start">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <div className="p-1 rounded bg-primary/10">
                      <Brain className="h-4 w-4 text-primary" />
                    </div>
                    The Puzzle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-relaxed font-medium">{puzzle.scenario}</p>
                </CardContent>
              </Card>

              {/* Right: Chat Interface */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Ask Yes/No Questions
                    {gameMode === 'easy' && (
                      <span className="ml-2 text-xs text-green-600 dark:text-green-400">💡 Hints on</span>
                    )}
                    {speechSupported && <span className="text-xs ml-2">(voice enabled)</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Messages */}
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                    {messages.length === 0 && !isAsking && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Ask a question to start investigating...
                      </p>
                    )}
                    {messages.map((msg, index) => (
                      <div
                        key={msg.id}
                        ref={index === messages.length - 1 ? lastMessageRef : undefined}
                        className={cn(
                          'flex gap-2',
                          msg.type === 'question' ? 'justify-end' : 'justify-start',
                          msg.type === 'hint' && 'justify-center'
                        )}
                      >
                        {msg.type === 'answer' && (
                          <Badge
                            variant="outline"
                            className={cn('px-3 py-1.5 text-sm font-medium', getAnswerColor(msg.content))}
                          >
                            {msg.content}
                          </Badge>
                        )}
                        {msg.type === 'hint' && (
                          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 px-3 py-1.5 rounded-lg text-sm max-w-[85%] text-center italic">
                            💡 {msg.content}
                          </div>
                        )}
                        {msg.type === 'error' && (
                          <Badge
                            variant="outline"
                            className="px-3 py-1.5 text-sm font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {msg.content}
                          </Badge>
                        )}
                        {msg.type === 'question' && (
                          <div className="bg-primary/10 px-3 py-1.5 rounded-lg text-sm max-w-[80%]">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    ))}
                    {isAsking && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Question Input with Voice */}
                  <div className="flex gap-2">
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Is there anyone else involved?"
                      disabled={isAsking || isSolved}
                      className="flex-1"
                    />
                    {speechSupported && (
                      <Button
                        type="button"
                        variant={isListening ? 'destructive' : 'outline'}
                        size="icon"
                        onClick={toggleListening}
                        disabled={isAsking || isSolved}
                        className={cn(isListening && 'animate-pulse')}
                        title={isListening ? 'Stop listening' : 'Start voice input'}
                      >
                        {isListening ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      onClick={askQuestion}
                      disabled={!question.trim() || isAsking || isSolved}
                      size="icon"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>

                  {isListening && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Listening... speak your question
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Solution Section */}
            <Separator />

            <Card className={cn(
              solutionResult?.status === 'correct' && 'border-green-500/50',
              solutionResult?.status === 'partial' && 'border-yellow-500/50',
              solutionResult?.status === 'incorrect' && 'border-red-500/50'
            )}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Think you know the answer?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Solution Result */}
                {solutionResult && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                    {getResultIcon(solutionResult.status)}
                    <div className="space-y-1">
                      <p className="font-semibold">{getResultTitle(solutionResult.status)}</p>
                      <p className="text-sm text-muted-foreground">{solutionResult.feedback}</p>
                      {solutionResult.accuracy < 100 && solutionResult.accuracy >= 50 && (
                        <p className="text-xs text-muted-foreground">
                          Accuracy: {solutionResult.accuracy}%
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Solution Input — available until solved */}
                {!isSolved ? (
                  <>
                    <Textarea
                      value={solutionText}
                      onChange={(e) => setSolutionText(e.target.value)}
                      placeholder="Describe what you think happened..."
                      disabled={isSubmitting}
                      rows={3}
                      className="resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={submitSolution}
                        disabled={!solutionText.trim() || isSubmitting}
                        className="flex-1"
                      >
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Submit Answer
                      </Button>
                      {solutionResult && solutionResult.status !== 'correct' && (
                        <Button
                          variant="outline"
                          onClick={() => setShowSolution(true)}
                        >
                          Reveal Solution
                        </Button>
                      )}
                    </div>
                    {!isSolved && solutionResult && (
                      <p className="text-xs text-muted-foreground text-center">
                        Keep asking questions above to gather more clues, then try again!
                      </p>
                    )}
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowSolution(true)}
                    className="w-full"
                  >
                    See Full Solution
                  </Button>
                )}

                {/* Full Solution Reveal */}
                {showSolution && (
                  <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                    <h4 className="font-semibold mb-2">The Solution:</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {puzzle.solution}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rating Section */}
            {showRating && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    How was this puzzle?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ratingSubmitted ? (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Thanks for your feedback!</span>
                    </div>
                  ) : (
                    <>
                      {/* Star rating */}
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            className="p-1 hover:scale-110 transition-transform"
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(0)}
                            onClick={() => setUserRating(star)}
                            disabled={isSubmittingRating}
                          >
                            <Star
                              className={cn(
                                'h-6 w-6 transition-colors',
                                (hoveredStar || userRating) >= star
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-muted-foreground/30'
                              )}
                            />
                          </button>
                        ))}
                        {userRating > 0 && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {userRating}/5
                          </span>
                        )}
                      </div>

                      {/* Optional feedback */}
                      <Textarea
                        value={ratingFeedback}
                        onChange={(e) => setRatingFeedback(e.target.value)}
                        placeholder="Any thoughts? (optional — e.g., 'Great logic!', 'Felt unfair', 'Had a flaw')"
                        disabled={isSubmittingRating}
                        rows={2}
                        className="resize-none text-sm"
                      />

                      <Button
                        onClick={submitRating}
                        disabled={userRating === 0 || isSubmittingRating}
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                      >
                        {isSubmittingRating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Submit Rating
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Generate New Puzzle */}
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={resetGame}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Generate New Puzzle
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          AI-powered lateral thinking puzzles — Ask yes/no questions to solve the mystery
        </div>
      </footer>
    </div>
  );
}
