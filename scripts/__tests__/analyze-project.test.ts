import { analyzeProject } from '../../src/app/lib/projectAnalysis';

jest.mock('../../src/app/lib/projectAnalysis', () => ({
  analyzeProject: jest.fn()
}));

describe('Project Analysis CLI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return basic analysis structure', async () => {
    const mockAnalysis = {
      technicalDebt: {
        critical: [],
        high: [],
        medium: []
      },
      featureMatrix: {
        implementation: [],
        proposed: []
      },
      recommendations: {
        immediate: [],
        strategic: []
      }
    };

    require('../../src/app/lib/projectAnalysis').analyzeProject.mockResolvedValue(mockAnalysis);

    const result = await analyzeProject(false);
    expect(result).toEqual(mockAnalysis);
  });

  test('should include quality metrics when requested', async () => {
    const mockAnalysis = {
      technicalDebt: {
        critical: [],
        high: [],
        medium: []
      },
      featureMatrix: {
        implementation: [],
        proposed: []
      },
      qualityMetrics: {
        coverage: 85,
        flakyTests: [],
        performance: 95
      },
      recommendations: {
        immediate: [],
        strategic: []
      }
    };

    require('../../src/app/lib/projectAnalysis').analyzeProject.mockResolvedValue(mockAnalysis);

    const result = await analyzeProject(true);
    expect(result.qualityMetrics).toBeDefined();
    expect(result.qualityMetrics?.coverage).toBe(85);
  });
});