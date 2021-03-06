import { FakeDataComponent } from './fake-data.component';

describe('FakeDataComponent', () => {
  describe('ngOnChanges()', () => {
    it('should share width containing a random number between provided values', () => {
      const component = new FakeDataComponent();
      component.minWidth = 30;
      component.maxWidth = 60;
      component.ngOnChanges(null);
      expect(component.width).toBeGreaterThanOrEqual(30);
      expect(component.width).toBeLessThanOrEqual(60);
    });

    it('should share width containing a random number between default values', () => {
      const component = new FakeDataComponent();
      component.ngOnChanges(null);
      expect(component.width).toBeGreaterThanOrEqual(component.minWidth);
      expect(component.width).toBeLessThanOrEqual(component.maxWidth);
    });
  });
});
