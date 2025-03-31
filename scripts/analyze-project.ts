#!/usr/bin/env node
import { analyzeProject } from '../src/app/lib/projectAnalysis';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  try {
    const includeQuality = process.argv.includes('--quality');
    const analysis = await analyzeProject(includeQuality);

    console.log('=== Project Analysis Report ===');
    console.log('\nTechnical Debt:');
    console.log('Critical:', analysis.technicalDebt.critical.join(', ') || 'None');
    console.log('High:', analysis.technicalDebt.high.join(', ') || 'None');
    console.log('Medium:', analysis.technicalDebt.medium.join(', ') || 'None');

    console.log('\nFeature Matrix:');
    console.log('Implemented:', analysis.featureMatrix.implementation.join(', '));
    console.log('Proposed:', analysis.featureMatrix.proposed.join(', '));

    if (analysis.qualityMetrics) {
      console.log('\nQuality Metrics:');
      console.log('Test Coverage:', `${analysis.qualityMetrics.coverage}%`);
      console.log('Performance Score:', `${analysis.qualityMetrics.performance}%`);
      console.log('Flaky Tests:', 
        analysis.qualityMetrics.flakyTests?.join(', ') || 'None');
    }

    console.log('\nRecommendations:');
    console.log('Immediate Actions:');
    analysis.recommendations.immediate.forEach((rec, i) => 
      console.log(`${i+1}. ${rec}`));
    console.log('\nStrategic Improvements:');
    analysis.recommendations.strategic.forEach((rec, i) => 
      console.log(`${i+1}. ${rec}`));

    // Save report to file
    const reportPath = path.join(process.cwd(), 'project-analysis-report.json');
    await fs.writeFile(reportPath, JSON.stringify(analysis, null, 2));
    console.log(`\nReport saved to ${reportPath}`);
  } catch (error) {
    console.error('Error analyzing project:', error);
    process.exit(1);
  }
}

main();