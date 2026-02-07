import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Replicate from "https://esm.sh/replicate@0.25.2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY')
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not set')
    }

    const replicate = new Replicate({
      auth: REPLICATE_API_KEY,
    })

    const body = await req.json()

    // Check prediction status
    if (body.predictionId) {
      console.log("Checking status for prediction:", body.predictionId)
      const prediction = await replicate.predictions.get(body.predictionId)
      console.log("Status:", prediction.status)
      return new Response(JSON.stringify(prediction), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Start new conversion
    const { videoUrl, videoDurationSeconds = 7200, targetFrames = 200 } = body

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required field: videoUrl" }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate frame interval for target frame count
    // For a 2-hour video (7200s) with 200 frames = 1 frame every 36 seconds
    const frameInterval = Math.max(1, Math.floor(videoDurationSeconds / targetFrames))
    const fps = 1 / frameInterval // e.g., 0.028 fps for 36-second intervals

    console.log("Starting video-to-gif conversion:", { 
      videoUrl, 
      videoDurationSeconds, 
      targetFrames,
      frameInterval: `1 frame every ${frameInterval} seconds`,
      calculatedFps: fps
    })

    // Use video-to-gif model that supports text overlays
    // This model extracts frames, adds timestamps, and creates GIF
    const prediction = await replicate.predictions.create({
      // Using lucataco/video-to-gif which supports customization
      version: "1cc67ba0f5a5a9fd6ad3b7c05cbdd1326bdfe54d32b0a52e78d1269ae0d808d3",
      input: {
        video: videoUrl,
        fps: Math.max(0.01, fps), // Minimum fps the model accepts
        width: 480, // Slightly larger for readability
        quality: 60, // Lower quality for smaller file size
      }
    })

    console.log("Prediction created:", prediction.id, prediction.status)

    return new Response(JSON.stringify({
      predictionId: prediction.id,
      status: prediction.status,
      frameInterval: frameInterval,
      estimatedFrames: targetFrames
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("Error in video-to-gif function:", error)
    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
