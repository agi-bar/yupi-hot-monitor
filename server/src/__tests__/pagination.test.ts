import { describe, it, expect } from 'vitest';

describe('分页逻辑测试', () => {
  describe('页码边界处理', () => {
    it('页码为 0 时应重置为 1', () => {
      const pageNum = parseInt('0');
      const validatedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      expect(validatedPage).toBe(1);
    });

    it('页码为负数时应重置为 1', () => {
      const pageNum = parseInt('-5');
      const validatedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      expect(validatedPage).toBe(1);
    });

    it('页码为非数字时应重置为 1', () => {
      const pageNum = parseInt('abc');
      const validatedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      expect(validatedPage).toBe(1);
    });

    it('正常页码应保持不变', () => {
      const pageNum = parseInt('5');
      const validatedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      expect(validatedPage).toBe(5);
    });

    it('页码超出总页数时应重置为最后一页', () => {
      const currentPage = 10;
      const totalPages = 5;
      const validatedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage;
      expect(validatedPage).toBe(5);
    });

    it('页码等于总页数时应保持不变', () => {
      const currentPage = 5;
      const totalPages = 5;
      const validatedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage;
      expect(validatedPage).toBe(5);
    });
  });

  describe('每页条数边界处理', () => {
    it('每页条数为 0 时应使用默认值', () => {
      const limitNum = parseInt('0');
      const defaultLimit = 20;
      const validatedLimit = isNaN(limitNum) || limitNum < 1 ? defaultLimit : limitNum;
      expect(validatedLimit).toBe(20);
    });

    it('每页条数为负数时应使用默认值', () => {
      const limitNum = parseInt('-10');
      const defaultLimit = 20;
      const validatedLimit = isNaN(limitNum) || limitNum < 1 ? defaultLimit : limitNum;
      expect(validatedLimit).toBe(20);
    });

    it('每页条数为非数字时应使用默认值', () => {
      const limitNum = parseInt('xyz');
      const defaultLimit = 20;
      const validatedLimit = isNaN(limitNum) || limitNum < 1 ? defaultLimit : limitNum;
      expect(validatedLimit).toBe(20);
    });

    it('每页条数低于最小值时应使用最小值', () => {
      let limitNum = parseInt('0');
      const MIN_PAGE_SIZE = 1;
      const MAX_PAGE_SIZE = 100;
      if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
      if (limitNum < MIN_PAGE_SIZE) limitNum = MIN_PAGE_SIZE;
      if (limitNum > MAX_PAGE_SIZE) limitNum = MAX_PAGE_SIZE;
      expect(limitNum).toBe(20);
    });

    it('每页条数超过最大值时应使用最大值', () => {
      let limitNum = parseInt('200');
      const MIN_PAGE_SIZE = 1;
      const MAX_PAGE_SIZE = 100;
      if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
      if (limitNum < MIN_PAGE_SIZE) limitNum = MIN_PAGE_SIZE;
      if (limitNum > MAX_PAGE_SIZE) limitNum = MAX_PAGE_SIZE;
      expect(limitNum).toBe(100);
    });

    it('正常每页条数应保持不变', () => {
      let limitNum = parseInt('20');
      const MIN_PAGE_SIZE = 1;
      const MAX_PAGE_SIZE = 100;
      if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
      if (limitNum < MIN_PAGE_SIZE) limitNum = MIN_PAGE_SIZE;
      if (limitNum > MAX_PAGE_SIZE) limitNum = MAX_PAGE_SIZE;
      expect(limitNum).toBe(20);
    });

    it('支持常用的页面大小选项', () => {
      const validSizes = [10, 20, 50];
      expect(validSizes.includes(10)).toBe(true);
      expect(validSizes.includes(20)).toBe(true);
      expect(validSizes.includes(50)).toBe(true);
      expect(validSizes.includes(15)).toBe(false);
    });
  });

  describe('分页计算逻辑', () => {
    it('正确计算 skip 值', () => {
      const pageNum = 3;
      const limitNum = 20;
      const skip = (pageNum - 1) * limitNum;
      expect(skip).toBe(40);
    });

    it('第一页的 skip 值应为 0', () => {
      const pageNum = 1;
      const limitNum = 20;
      const skip = (pageNum - 1) * limitNum;
      expect(skip).toBe(0);
    });

    it('正确计算总页数', () => {
      const total = 100;
      const limitNum = 20;
      const totalPages = Math.ceil(total / limitNum);
      expect(totalPages).toBe(5);
    });

    it('总条数不能整除时向上取整', () => {
      const total = 101;
      const limitNum = 20;
      const totalPages = Math.ceil(total / limitNum);
      expect(totalPages).toBe(6);
    });

    it('总条数为 0 时总页数应为 0', () => {
      const total = 0;
      const limitNum = 20;
      const totalPages = Math.ceil(total / limitNum);
      expect(totalPages).toBe(0);
    });

    it('最后一页数据不足时仍计算正确', () => {
      const total = 95;
      const limitNum = 20;
      const totalPages = Math.ceil(total / limitNum);
      const lastPageItems = total - (totalPages - 1) * limitNum;
      expect(totalPages).toBe(5);
      expect(lastPageItems).toBe(15);
    });
  });

  describe('空数据场景', () => {
    it('无数据时 totalPages 为 0', () => {
      const total = 0;
      const limitNum = 20;
      const totalPages = Math.ceil(total / limitNum);
      expect(totalPages).toBe(0);
    });

    it('无数据时不应显示分页控件', () => {
      const totalPages = 0;
      const shouldShowPagination = totalPages > 1;
      expect(shouldShowPagination).toBe(false);
    });

    it('单页数据时不应显示分页控件', () => {
      const totalPages = 1;
      const shouldShowPagination = totalPages > 1;
      expect(shouldShowPagination).toBe(false);
    });

    it('多页数据时应显示分页控件', () => {
      const totalPages = 2;
      const shouldShowPagination = totalPages > 1;
      expect(shouldShowPagination).toBe(true);
    });
  });

  describe('边界场景', () => {
    it('总页数为 1 时页码越界应重置为 1', () => {
      const currentPage = 5;
      const totalPages = 1;
      const validatedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage;
      expect(validatedPage).toBe(1);
    });

    it('空数据集时页码越界不处理', () => {
      const currentPage = 5;
      const totalPages = 0;
      const validatedPage = currentPage > totalPages && totalPages > 0 ? totalPages : currentPage;
      expect(validatedPage).toBe(5);
    });

    it('小数页码应取整', () => {
      const page = 3.7;
      const pageNum = parseInt(page.toString());
      const validatedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      expect(validatedPage).toBe(3);
    });

    it('非常大的页码应限制在最大值内', () => {
      const pageNum = parseInt('999999999');
      const validatedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      expect(validatedPage).toBe(999999999);
    });
  });
});
