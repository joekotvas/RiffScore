import { renderHook } from '@testing-library/react';
import { useScoreLogic } from '../useScoreLogic';
import { createDefaultScore } from '../../types';

// Mock dependencies
jest.mock('../../engines/audioEngine', () => ({
    playTone: jest.fn()
}));

jest.mock('../../exporters/musicXmlExporter', () => ({
    exportToXML: jest.fn()
}));

describe('useScoreLogic Regression Tests', () => {
    test('should expose all required functions', () => {
        const { result } = renderHook(() => useScoreLogic(createDefaultScore()));

        // Verify Mutation Handlers
        expect(typeof result.current.undo).toBe('function');
        expect(typeof result.current.redo).toBe('function');
        // commitScore removed
        expect(typeof result.current.addNoteToMeasure).toBe('function');
        expect(typeof result.current.deleteSelected).toBe('function');
        expect(typeof result.current.handleAccidentalToggle).toBe('function');
        expect(typeof result.current.handleTieToggle).toBe('function');
        
        // Verify Navigation Handlers (Fix for recent bugs)
        expect(typeof result.current.transposeSelection).toBe('function');
        expect(typeof result.current.moveSelection).toBe('function');
        expect(typeof result.current.handleNoteSelection).toBe('function');

        // Verify State Accessors
        expect(result.current.score).toBeDefined();
        expect(result.current.selection).toBeDefined();
    });
});
