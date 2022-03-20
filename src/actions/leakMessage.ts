import { MessageReaction } from 'discord.js';
import { shouldRunLeak } from '@/actions/utils/leakMessage/shouldRunLeak';
import { pickEmoji } from '@/actions/utils/pickEmoji';
import { buildNoMentionReply } from '@/actions/utils/buildNoMentionReply';
import { TwitterService } from '@/lib/services/twitter';
import {
  ContentsTooLongException,
  EmojiNotFoundError,
  NetworkHandshakeException,
  ServerErrorException,
  UnauthorizedException,
} from '@/lib/exceptions';
import {
  isTextChannel,
  getChannelFromReaction,
} from '@/typeGuards/isTextChannel';
import { inspectContents } from '@/actions/utils/leakMessage/inspectContents';

interface Services {
  twitter: TwitterService;
}

export const leakMessage = async (
  reaction: MessageReaction,
  services?: Services
) => {
  // 原則として来ることはないがコンパイラを黙らせる意味で書いている
  const channel = getChannelFromReaction(reaction);
  if (!isTextChannel(channel)) return;

  const filters: Parameters<typeof shouldRunLeak>[0] = {
    channelName: channel.name,
    emojiName: reaction.emoji.name || '',
    isAuthorBot: reaction.message.author?.bot || false,
  };

  if (!shouldRunLeak(filters)) return;

  try {
    const twitterService = services?.twitter || new TwitterService();
    const messageContent = inspectContents(reaction.message.content || '');

    const tweetResultURL = await twitterService.postTweet(messageContent);
    const emoji = pickEmoji(reaction.client, 'watching_you2');

    const replyOptions = buildNoMentionReply(`${emoji} ${tweetResultURL}`);

    await reaction.message.reply(replyOptions);
  } catch (error: unknown) {
    if (error instanceof ContentsTooLongException) {
      await reaction.message.reply(
        buildNoMentionReply(`${reaction.emoji} < この投稿長すぎなんだわ`)
      );
      return;
    }

    if (error instanceof EmojiNotFoundError) {
      await reaction.message.reply(
        buildNoMentionReply(
          `${reaction.emoji} < わりい、使おうとしたやつがないんだわ`
        )
      );
      return;
    }

    if (error instanceof NetworkHandshakeException) {
      await reaction.message.reply(
        buildNoMentionReply(
          `${reaction.emoji} < ネットワークの接続で問題が発生したぽいで`
        )
      );
      return;
    }

    if (error instanceof UnauthorizedException) {
      await reaction.message.reply(
        buildNoMentionReply(`${reaction.emoji} < twitter の認証で死んだんだわ`)
      );
      return;
    }

    if (error instanceof ServerErrorException) {
      await reaction.message.reply(
        buildNoMentionReply(
          `${reaction.emoji} < Twitter のサービスが死んでるかもしれん`
        )
      );
      return;
    }

    if (error instanceof Error) {
      await reaction.message.reply(
        buildNoMentionReply(`${reaction.emoji} < なんか知らんエラーが出たわ`)
      );
      const errorMessage = '```\n' + `${error.message}\n` + '```';
      await reaction.message.channel.send(errorMessage);
      return;
    }
  } finally {
    // ついた絵文字が消される
    await reaction.remove();
  }
};
