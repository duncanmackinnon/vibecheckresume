import { NextRequest, NextResponse } from 'next/server';
import { PDFExtract } from 'pdf-parse';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const resumeFile = formData.get('resume') as File;
    const jobDescription = formData.get('jobDescription') as string;

    if (!resumeFile || !jobDescription) {
      return NextResponse.json(
        { error: 'Resume and job description are required' },
        { status: 400 }
      );
    }

    // Read resume content
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    const pdfExtract = new PDFExtract();
    const resumeText = await pdfExtract.extract(buffer);

    // Use OpenAI to analyze the resume against job description
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a resume analyzer. Compare the resume content with the job description and:
          1. Calculate a match percentage
          2. Identify skills/keywords that match
          3. List important missing skills/requirements
          Provide the analysis in JSON format with fields: score (number), matchedSkills (array of objects with name and match properties), and missingSkills (array of strings).`
        },
        {
          role: "user",
          content: `Resume:\n${resumeText}\n\nJob Description:\n${jobDescription}`
        }
      ]
    });

    const analysis = JSON.parse(response.choices[0].message.content || '{}');

    return NextResponse.json({
      score: analysis.score,
      matchedSkills: analysis.matchedSkills,
      missingSkills: analysis.missingSkills
    });
  } catch (error) {
    console.error('Error analyzing resume:', error);
    return NextResponse.json(
      { error: 'Failed to analyze resume' },
      { status: 500 }
    );
  }
}