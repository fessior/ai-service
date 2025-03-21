import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { fakeSystemTime } from '@test-helpers/time';
import { Model } from 'mongoose';

import { TokenService } from './token.service';
import { TokenMockData } from '../mocks';
import { Token } from '../schemas';
import { authConfigObj } from '@/common/config';
import { ConfigMock } from '@/common/config/mocks';
import { UserMockData } from '@/users/mocks';
import { User } from '@/users/schemas';

const MOCK_USER = UserMockData.getUser();

const VALID_TOKEN = TokenMockData.getValidToken(MOCK_USER);
const INACTIVE_TOKEN = TokenMockData.getInactiveToken(MOCK_USER);
const EXPIRED_TOKEN = TokenMockData.getExpiredToken(MOCK_USER);

describe('TokenService', () => {
  let tokenService: TokenService;
  let tokenModel: DeepMocked<Model<Token>>;

  beforeAll(async () => {
    tokenModel = createMock<Model<Token>>();
    const userService = createMock<Model<User>>();
    const mod = await Test.createTestingModule({
      providers: [
        TokenService,
        JwtService,
        {
          provide: getModelToken(Token.name),
          useValue: tokenModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: userService,
        },
        {
          provide: authConfigObj.KEY,
          useValue: ConfigMock.getAuthConfig(),
        },
      ],
    }).compile();
    tokenService = mod.get(TokenService);
  });

  it('Should be able to sign and decode its own token', async () => {
    const accessToken = await tokenService.signAccessToken(VALID_TOKEN);
    const decodedToken = await tokenService.decodeAccessToken(accessToken);
    expect(decodedToken.tokenId).toBe(VALID_TOKEN._id.toString());
  });

  describe('Finding user attached to token', () => {
    test('Token is not found', async () => {
      (<jest.Mock>(
        tokenModel.findById(VALID_TOKEN._id).populate('userId').lean
      )).mockResolvedValueOnce(null);
      await expect(
        tokenService.findUserByToken(VALID_TOKEN._id),
      ).rejects.toThrow(UnauthorizedException);
    });

    test('Existing token found', async () => {
      (<jest.Mock>(
        tokenModel.findById(VALID_TOKEN._id).populate('userId').lean
      )).mockResolvedValueOnce({ ...VALID_TOKEN, userId: MOCK_USER });
      const user = await tokenService.findUserByToken(VALID_TOKEN._id);
      expect(user).toEqual(MOCK_USER);
    });
  });

  describe('Testing token validity, given the token ID', () => {
    beforeAll(() => {
      fakeSystemTime(TokenMockData.mockTimestamp);
    });
    afterAll(() => {
      jest.useRealTimers();
    });

    it('Should return null if the token is not found', async () => {
      (<jest.Mock>(
        tokenModel.findById(VALID_TOKEN._id).lean
      )).mockResolvedValueOnce(null);
      const token = await tokenService.findAndValidateToken(VALID_TOKEN._id);
      expect(token).toBeNull();
    });

    it("Should return the token if it's still active, and not expired", async () => {
      (<jest.Mock>(
        tokenModel.findById(VALID_TOKEN._id).lean
      )).mockResolvedValueOnce(VALID_TOKEN);
      const token = await tokenService.findAndValidateToken(VALID_TOKEN._id);
      expect(token).toEqual(VALID_TOKEN);
    });

    it('Should return null if the token is inactive', async () => {
      (<jest.Mock>(
        tokenModel.findById(INACTIVE_TOKEN._id).lean
      )).mockResolvedValueOnce(INACTIVE_TOKEN);
      const token = await tokenService.findAndValidateToken(INACTIVE_TOKEN._id);
      expect(token).toBeNull();
    });

    it('Should return null if the token is passed its expiry date', async () => {
      (<jest.Mock>(
        tokenModel.findById(EXPIRED_TOKEN._id).lean
      )).mockResolvedValueOnce(EXPIRED_TOKEN);
      const token = await tokenService.findAndValidateToken(EXPIRED_TOKEN._id);
      expect(token).toBeNull();
    });
  });
});
