declare module "nodemailer" {
  export function createTransport(
    options: string | Record<string, unknown>,
  ): {
    sendMail(input: {
      to: string;
      from: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{
      rejected?: string[];
      pending?: string[];
    }>;
  };
}
